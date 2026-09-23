/* OpenTv settings + i18n + auth wiring (runs after app.js) */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }

  function openSettings() {
    var m = $('settings-modal');
    if (!m) return;
    var lang = $('set-lang');
    if (lang && window.I18n) lang.value = I18n.getLang();
    var subLang = $('set-sub-lang');
    if (subLang && window.SubtitleStore) subLang.value = SubtitleStore.getPrefLang();
    var size = $('set-sub-size');
    var style = $('set-sub-style');
    try {
      var p = JSON.parse(localStorage.getItem('unitv_subtitle_settings') || '{}');
      if (size && p.size != null) size.value = String(p.size);
      if (style && p.style != null) style.value = String(p.style);
    } catch (e) {}
    m.classList.remove('hidden');
  }

  function closeSettings() {
    var m = $('settings-modal');
    if (m) m.classList.add('hidden');
  }

  function saveSettings() {
    var lang = $('set-lang');
    var subLang = $('set-sub-lang');
    var size = $('set-sub-size');
    var style = $('set-sub-style');
    if (lang && window.I18n) I18n.setLang(lang.value);
    if (subLang && window.SubtitleStore) SubtitleStore.setPrefLang(subLang.value);
    try {
      localStorage.setItem('unitv_subtitle_settings', JSON.stringify({
        size: size ? parseFloat(size.value) : 1,
        style: style ? parseInt(style.value, 10) : 0,
        delay: 0
      }));
    } catch (e) {}
    if (window.player && typeof player.applySubtitlePrefs === 'function') player.applySubtitlePrefs();
    closeSettings();
    if (window.showToast) showToast('Configurações salvas', 'success');
    else alert('Configurações salvas');
  }

  function syncAuthUi() {
    var logout = $('btn-logout');
    var loginLink = $('btn-login-link');
    var adminLink = $('btn-admin-link');
    var name = $('user-display');
    var plan = $('user-plan');
    if (!window.AuthStore) return Promise.resolve();
    return AuthStore.init().then(function () {
      var authed = AuthStore.isAuthenticated();
      var admin = AuthStore.isAdmin();
      var approved = AuthStore.isApproved();
      var profile = AuthStore.getProfile();
      var user = AuthStore.getUser();
      var status = AuthStore.getStatus();
      if (loginLink) loginLink.classList.toggle('hidden', authed);
      if (adminLink) adminLink.classList.toggle('hidden', !admin);
      if (logout) logout.classList.toggle('hidden', !authed);
      if (name) name.textContent = (profile && (profile.full_name || profile.email)) || (user && user.email) || (authed ? 'Usuário' : 'Convidado');
      if (plan) {
        if (admin) plan.textContent = 'Admin';
        else if (status === 'pending') plan.textContent = 'Aguardando';
        else if (status === 'rejected') plan.textContent = 'Recusado';
        else if (approved) plan.textContent = 'Membro';
        else plan.textContent = 'Sem acesso';
      }
      enforceAccess();
      return { authed: authed, approved: approved, admin: admin, status: status };
    }).catch(function () { return null; });
  }

  function enforceAccess() {
    // splash removida; boot é feito em app.js (bootApp)
  }

  function requireApprovedAccess() {
    if (!window.AuthStore) return;
    AuthStore.init().then(function () {
      if (!AuthStore.isAuthenticated()) {
        location.replace('login.html?next=index.html');
        return;
      }
      if (!AuthStore.isApproved() && !AuthStore.isAdmin()) {
        location.replace('login.html?next=index.html');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.I18n) I18n.init();

    $('btn-settings')?.addEventListener('click', openSettings);
    $('btn-close-settings')?.addEventListener('click', closeSettings);
    $('btn-save-settings')?.addEventListener('click', saveSettings);
    $('btn-cancel-settings')?.addEventListener('click', closeSettings);

    $('btn-logout')?.addEventListener('click', function (e) {
      if (!window.AuthStore || !AuthStore.isAuthenticated()) return;
      e.preventDefault();
      AuthStore.signOut().then(function () { location.href = 'login.html'; });
    });

    if (window.AuthStore) {
      AuthStore.onAuthChange(function () { syncAuthUi(); });
      syncAuthUi();
    }

    if (window.player && player.btnSubtitles && !player._subLocalBound) {
      player._subLocalBound = true;
      $('btn-local-sub')?.addEventListener('click', function () {
        if (player.videoEl && window.SubtitleStore) SubtitleStore.createLocalInput(player.videoEl);
      });
    }
  });

  window.OpenTvSettings = { open: openSettings, close: closeSettings, save: saveSettings, requireApprovedAccess: requireApprovedAccess };
})();
