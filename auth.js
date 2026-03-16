/* ================================================================
   IMPACTGRID AUTH — auth.js
   index.html  → guest mode allowed (gate handled in page JS)
   settings.html → still redirects to login if no session
================================================================ */

/* Logout — save data first, THEN sign out */
window.logout = async function () {
  try {
    /* Save before anything is cleared */
    if (window.currentUser && typeof saveUserData === 'function' && (window.businessData||[]).length > 0) {
      await saveUserData();
    }
  } catch(e) {}
  try {
    if (window.supabaseClient) await window.supabaseClient.auth.signOut();
  } catch (e) {}
  window.location.href = 'login.html';
};

/* Pages that require login — guests redirected immediately */
var PROTECTED_PAGES = ['settings.html'];
var currentPage = window.location.pathname.split('/').pop() || 'index.html';
var isProtected = PROTECTED_PAGES.indexOf(currentPage) !== -1;

window.supabaseReady.then(function (supabase) {

  supabase.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_OUT') {
      if (isProtected) {
        window.location.href = 'login.html';
      } else {
        /* On index — revert to guest mode.
           We do NOT clear businessData or trigger any saves here.
           logout() already saved before signOut was called.
           The page will reload via location.href so data clears naturally. */
        window.__igLoggedIn = false;
        window.__igGuestUsed = false;
        window.__igPlanInitDone = false;
        window.currentUser = null;
      }
    }
    if (event === 'TOKEN_REFRESHED') {
      console.log('[ImpactGrid] Session token refreshed.');
    }
  });

  checkAuth(supabase);
});

async function checkAuth(supabase) {
  try {
    var result  = await supabase.auth.getSession();
    var session = result.data && result.data.session;
    var error   = result.error;

    if (error) {
      console.error('[ImpactGrid] Session error:', error.message);
      if (isProtected) window.location.href = 'login.html';
      return;
    }

    if (!session) {
      if (isProtected) {
        window.location.href = 'login.html';
      } else {
        /* Guest on index — allow, page JS handles the gate */
        console.log('[ImpactGrid] Guest mode.');
        window.__igLoggedIn = false;
      }
      return;
    }

    /* Fully authenticated */
    console.log('[ImpactGrid] Authenticated:', session.user.email);
    window.__igLoggedIn = true;

    /* Init plan system now we know user is real */
    if (typeof initPlanSystem === 'function') initPlanSystem();

  } catch (err) {
    console.error('[ImpactGrid] Auth check failed:', err);
    if (isProtected) window.location.href = 'login.html';
  }
}
