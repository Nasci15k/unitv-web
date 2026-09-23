/**
 * OpenTv — Cliente Supabase + AuthStore
 * Config lida das meta tags; fallback aos valores públicos do projeto.
 * Modo demo (localStorage) caso o SDK não carregue.
 */
(function () {
  'use strict';

  var FALLBACK_URL = 'https://figvurwbnocrzoupvtgs.supabase.co';
  var FALLBACK_KEY = 'sb_publishable_MRl6mB27qtXrDMyF9obwUg_vYtSNh7f';
  var CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  var DEMO_KEY = 'unitv_auth_demo';

  var SUP_URL = readMeta('supabase-url') || FALLBACK_URL;
  var SUP_KEY = readMeta('supabase-anon') || FALLBACK_KEY;

  var client = null;
  var initPromise = null;
  var demoMode = false;
  var user = null;
  var profile = null;
  var listeners = [];

  function readMeta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el ? String(el.getAttribute('content') || '').trim() : '';
  }

  function ptError(err) {
    var m = String((err && (err.message || err.error_description || err.error)) || '');
    if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(m)) return 'E-mail ainda não confirmado.';
    if (/already registered|already been registered|user already/i.test(m)) return 'Este e-mail já está cadastrado.';
    if (/password should be at least|weak_password/i.test(m)) return 'A senha precisa de pelo menos 6 caracteres.';
    if (/rate limit|too many requests/i.test(m)) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
    if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Falha de rede ao falar com o servidor.';
    if (!m) return 'Erro inesperado. Tente novamente.';
    return m;
  }

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](user, profile); } catch (e) { /* noop */ }
    }
  }

  function loadSdk() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = CDN;
      s.async = true;
      s.onload = function () {
        if (window.supabase && window.supabase.createClient) resolve(window.supabase);
        else reject(new Error('SDK Supabase inválido'));
      };
      s.onerror = function () { reject(new Error('Falha ao carregar o SDK Supabase')); };
      document.head.appendChild(s);
    });
  }
  /* ---- modo demo (localStorage) ---- */
  function demoRead() {
    try {
      var d = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null');
      return (d && d.users) ? d : { users: [], session: null };
    } catch (e) { return { users: [], session: null }; }
  }
  function demoWrite(d) {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(d)); } catch (e) { /* noop */ }
  }
  function demoProfileFrom(u) {
    return u ? {
      id: u.id, email: u.email,
      full_name: (u.user_metadata && u.user_metadata.full_name) || '',
      role: (u.user_metadata && u.user_metadata.role) || 'user',
      status: (u.user_metadata && u.user_metadata.status) || 'approved',
      created_at: u.created_at || new Date().toISOString()
    } : null;
  }
  function demoRestore() {
    var d = demoRead();
    user = d.session || null;
    profile = demoProfileFrom(user);
  }

  /* ---- perfil real ---- */
  function refreshProfile() {
    if (!client || !user) { profile = null; return Promise.resolve(null); }
    return client.from('profiles')
      .select('id,email,full_name,role,status,created_at')
      .eq('id', user.id).maybeSingle()
      .then(function (res) {
        profile = (res && res.data) || null;
        if (profile && !profile.status) profile.status = 'approved';
        if (!profile) {
          profile = {
            id: user.id,
            email: user.email,
            full_name: (user.user_metadata && user.user_metadata.full_name) || '',
            role: 'user',
            status: 'pending',
            created_at: user.created_at || new Date().toISOString()
          };
        }
        return profile;
      })
      .catch(function () {
        profile = {
          id: user.id, email: user.email, full_name: '',
          role: 'user', status: 'pending',
          created_at: user.created_at || new Date().toISOString()
        };
        return profile;
      });
  }

  /* ---- init ---- */
  function init() {
    if (initPromise) return initPromise;
    initPromise = loadSdk().then(function (sdk) {
      client = sdk.createClient(SUP_URL, SUP_KEY, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
      client.auth.onAuthStateChange(function (_evt, session) {
        user = (session && session.user) || null;
        refreshProfile().then(emit);
      });
      return client.auth.getSession().then(function (res) {
        user = (res && res.data && res.data.session && res.data.session.user) || null;
        return refreshProfile();
      }).then(function () { emit(); return client; });
    }).catch(function () {
      demoMode = true;
      client = null;
      demoRestore();
      emit();
      return null;
    });
    return initPromise;
  }

  /* ---- operações ---- */
  function signIn(email, password) {
    return init().then(function () {
      if (demoMode) {
        var d = demoRead();
        var found = null;
        for (var i = 0; i < d.users.length; i++) {
          if (d.users[i].email === email && d.users[i].password === password) found = d.users[i];
        }
        if (!found) throw new Error('E-mail ou senha incorretos.');
        d.session = { id: found.id, email: found.email, user_metadata: found.user_metadata, created_at: found.created_at };
        demoWrite(d);
        user = d.session;
        profile = demoProfileFrom(user);
        emit();
        return user;
      }
      return client.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          user = (res.data && res.data.user) || null;
          return refreshProfile();
        })
        .then(function () { emit(); return user; })
        .catch(function (err) { throw new Error(ptError(err)); });
    });
  }
  function signUp(email, password, fullName) {
    return init().then(function () {
      if (demoMode) {
        var d = demoRead();
        for (var i = 0; i < d.users.length; i++) {
          if (d.users[i].email === email) throw new Error('Este e-mail já está cadastrado.');
        }
        var nu = {
          id: 'demo-' + Date.now(), email: email,
          password: password, created_at: new Date().toISOString(),
          user_metadata: { full_name: fullName || '', role: 'user', status: 'pending' }
        };
        d.users.push(nu);
        d.session = { id: nu.id, email: nu.email, user_metadata: nu.user_metadata, created_at: nu.created_at };
        demoWrite(d);
        user = d.session;
        profile = demoProfileFrom(user);
        emit();
        return { user: nu, needsConfirm: false };
      }
      return client.auth.signUp({
        email: email, password: password,
        options: { data: { full_name: fullName || '' } }
      }).then(function (res) {
        var u = (res.data && res.data.user) || null;
        var session = (res.data && res.data.session) || null;
        user = u;
        if (!session && u) {
          emit();
          return { user: u, needsConfirm: true };
        }
        return refreshProfile().then(function () {
          emit();
          return { user: u, needsConfirm: false };
        });
      })
        .catch(function (err) { throw new Error(ptError(err)); });
    });
  }

  function signOut() {
    return init().then(function () {
      if (demoMode) {
        var d = demoRead();
        d.session = null;
        demoWrite(d);
        user = null;
        profile = null;
        emit();
        return null;
      }
      return client.auth.signOut().then(function () {
        user = null;
        profile = null;
        emit();
        return null;
      }).catch(function () { user = null; profile = null; emit(); return null; });
    });
  }

  window.AuthStore = {
    init: init,
    isAuthenticated: function () { return !!user; },
    getUser: function () { return user; },
    getProfile: function () { return profile; },
    isAdmin: function () { return !!(profile && profile.role === 'admin'); },
    isApproved: function () {
      if (!user) return false;
      if (profile && profile.role === 'admin') return true;
      return !!(profile && profile.status === 'approved');
    },
    getStatus: function () {
      if (!user) return 'anon';
      if (profile && profile.role === 'admin') return 'approved';
      return (profile && profile.status) || 'pending';
    },
    isDemo: function () { return demoMode; },
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    onAuthChange: function (cb) {
      if (typeof cb !== 'function') return function () {};
      listeners.push(cb);
      return function () {
        var idx = listeners.indexOf(cb);
        if (idx > -1) listeners.splice(idx, 1);
      };
    }
  };
})();
