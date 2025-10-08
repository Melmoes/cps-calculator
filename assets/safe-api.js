
// safe-api.js — queue + debounce + jittered retries to avoid Zendesk ticket save races
(function(){
  const log = (...a)=>{try{console.debug('[safe-api]', ...a)}catch(e){}}

  // Small sleep utility
  const sleep = (ms)=> new Promise(res=>setTimeout(res, ms));

  // A simple async queue (mutex) so only one update runs at a time
  class AsyncQueue {
    constructor(){ this.p = Promise.resolve() }
    enqueue(fn){
      const run = async()=>{
        try { return await fn() }
        catch (e) { throw e }
      }
      const q = this.p.then(run, run)
      this.p = q.catch(()=>{}) // keep chain alive
      return q
    }
  }

  // Exponential backoff with jitter
  async function withRetry(task, {retries=3, base=400, factor=1.6, jitter=true}={}){
    let attempt = 0, lastErr
    while (attempt <= retries){
      try {
        const r = await task()
        return r
      } catch (e){
        lastErr = e
        const status = (e && e.status) || (e && e.response && e.response.status)
        const body = (e && e.response && e.response.data) || (e && e.data)
        const text = (typeof body === 'string' ? body : JSON.stringify(body || {}))
        // Known Zendesk race: "Ticket not saved / a change was made..."
        const isRace = status === 409 || /not saved|a change was made/i.test(text || '')

        // Retry only on likely race/409/429/timeouts
        const isRetryable = isRace || status === 429 || status === 503 || status === 502 || status === 408
        if (!isRetryable || attempt === retries) break

        let wait = base * (factor ** attempt)
        if (jitter) wait = Math.round(wait * (0.5 + Math.random())) // 50–150% jitter
        log(`retry #${attempt+1} in ${wait}ms`, { status, text })
        await sleep(wait)
        attempt++
      }
    }
    throw lastErr
  }

  // Debounce map keyed by logical operation, so multiple rapid calls coalesce
  // Each entry stores: { timeout, promises: [resolve functions] }
  const debouncers = new Map()
  function debounce(key, fn, wait=1000){
    let entry = debouncers.get(key)
    if (entry) {
      clearTimeout(entry.timeout)
    } else {
      entry = { timeout: null, promises: [] }
      debouncers.set(key, entry)
    }
    
    return new Promise((resolve, reject)=>{
      entry.promises.push({ resolve, reject })
      entry.timeout = setTimeout(async ()=>{
        const allPromises = entry.promises
        debouncers.delete(key)
        try {
          const result = await fn()
          allPromises.forEach(p => p.resolve(result))
        } catch (error) {
          allPromises.forEach(p => p.reject(error))
        }
      }, wait)
    })
  }

  // Global singleton queue to serialize writes to the Ticket API
  const writeQueue = new AsyncQueue()

  // Public helper: queues, optional pre-wait, debounce by key, and retries
  async function safeUpdate(task, opts={}){
    const {
      key="ticket-write",
      preWaitMs=1000,   // give Zendesk time to persist agent submit
      debounceMs=800,   // coalesce rapid updates from the app
      retries=3
    } = opts

    // 1) Debounce by logical key so bursts collapse to one write
    return debounce(key, () => writeQueue.enqueue(async () => {
      // 2) Optional grace period before we even try writing
      if (preWaitMs > 0) await sleep(preWaitMs)

      // 3) Retry on known race-y conditions
      return withRetry(task, { retries })
    }), debounceMs)
  }

  // Expose to window
  window.safeApi = { sleep, withRetry, safeUpdate, AsyncQueue }
})();
