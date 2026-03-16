/* ================================================================
   IMPACTGRID — SUPABASE CLIENT  (DO NOT MODIFY)
================================================================ */
(function () {
  var SUPABASE_URL = 'https://vopehiqnduxobtaamrnh.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_oPR-GdRq7Rz3RvBepMkVQw_b7R6ocA3';

  /* Expose a promise so auth.js, plans.js and settings.html can safely
     await the client instead of racing against the CDN load. */
  var _resolve;
  window.supabaseReady = new Promise(function (res) { _resolve = res; });

  function tryInit() {
    if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
      try {
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
          }
        });
        console.log('[ImpactGrid] Supabase ready');
        _resolve(window.supabaseClient);
      } catch (e) {
        console.error('[ImpactGrid] Supabase createClient failed:', e);
      }
    } else {
      setTimeout(tryInit, 80);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();
