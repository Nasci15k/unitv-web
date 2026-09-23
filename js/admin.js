(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var titles = { painel: 'Painel', users: 'Usuários', settings: 'Configurações', content: 'Conteúdo' };
  var userFilter = 'all';
  var allUsers = [];

  function showMsg(id, text, ok) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'msg ' + (ok ? 'ok' : 'err');
  }
  function hideMsg(id) {
    var el = $(id);
    if (el) { el.textContent = ''; el.className = 'msg hidden'; }
  }

  function setView(name) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.add('hidden'); });
    var view = $('view-' + name);
    if (view) view.classList.remove('hidden');
    document.querySelectorAll('.nav-a[data-view]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === name);
    });
    $('view-title').textContent = titles[name] || name;
    if (name === 'users') loadUsers();
    if (name === 'settings') loadSettings();
  }

  function getClient() {
    var url = document.querySelector('meta[name=supabase-url]')?.content;
    var key = document.querySelector('meta[name=supabase-anon]')?.content;
    if (!window.supabase || !url || !key) throw new Error('SDK indisponível');
    return window.supabase.createClient(url, key);
  }

  function directProfiles() {
    var c = getClient();
    return c.from('profiles')
      .select('id,email,full_name,role,status,created_at')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(function (res) {
        if (res.error) throw new Error(res.error.message);
        return res.data || [];
      });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function statusLabel(st) {
    if (st === 'approved') return '<span class="pill ok">Aprovado</span>';
    if (st === 'rejected') return '<span class="pill err">Recusado</span>';
    return '<span class="pill warn">Pendente</span>';
  }

  function updateKpis(users) {
    var admins = users.filter(function (u) { return u.role === 'admin'; }).length;
    var pending = users.filter(function (u) { return (u.status || 'pending') === 'pending'; }).length;
    var approved = users.filter(function (u) { return u.status === 'approved' || u.role === 'admin'; }).length;
    if ($('kpi-users')) $('kpi-users').textContent = String(users.length);
    if ($('kpi-admins')) $('kpi-admins').textContent = String(admins);
    if ($('kpi-pending')) $('kpi-pending').textContent = String(pending);
    if ($('kpi-approved')) $('kpi-approved').textContent = String(approved);
  }

  function renderUsers() {
    var body = $('users-body');
    if (!body) return;
    var users = allUsers.filter(function (u) {
      if (userFilter === 'all') return true;
      if (userFilter === 'approved') return u.status === 'approved' || u.role === 'admin';
      return (u.status || 'pending') === userFilter;
    });
    updateKpis(allUsers);
    if (!users.length) {
      body.innerHTML = '<tr><td colspan="6">Nenhum usuário neste filtro.</td></tr>';
      return;
    }
    body.innerHTML = users.map(function (u) {
      var when = u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '—';
      var role = u.role === 'admin' ? 'Admin' : 'Usuário';
      var st = u.status || 'pending';
      var acts = [];
      if (st !== 'approved') acts.push('<button class="btn sm primary" data-act="approve" data-uid="' + esc(u.id) + '">Aprovar</button>');
      if (st !== 'rejected') acts.push('<button class="btn sm danger" data-act="reject" data-uid="' + esc(u.id) + '">Recusar</button>');
      acts.push('<button class="btn sm" data-act="role" data-uid="' + esc(u.id) + '" data-role="' + (u.role === 'admin' ? 'user' : 'admin') + '">' +
        (u.role === 'admin' ? 'Rebaixar' : 'Tornar admin') + '</button>');
      return '<tr><td>' + esc(u.email || '') + '</td><td>' + esc(u.full_name || '—') + '</td><td>' + role +
        '</td><td>' + statusLabel(st) + '</td><td>' + when + '</td><td class="acts">' + acts.join(' ') + '</td></tr>';
    }).join('');
    body.querySelectorAll('button[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.dataset.act;
        var uid = btn.dataset.uid;
        if (act === 'approve') setUser(uid, { status: 'approved' }, 'Usuário aprovado.');
        else if (act === 'reject') setUser(uid, { status: 'rejected' }, 'Usuário recusado.');
        else if (act === 'role') setUser(uid, { role: btn.dataset.role }, 'Papel atualizado.');
      });
    });
  }

  async function setUser(userId, patch, okText) {
    hideMsg('users-msg');
    try {
      var c = getClient();
      var { error } = await c.from('profiles').update(patch).eq('id', userId);
      if (error) throw new Error(error.message);
      showMsg('users-msg', okText, true);
      loadUsers();
    } catch (e) {
      showMsg('users-msg', e.message || String(e), false);
    }
  }

  async function loadUsers() {
    hideMsg('users-msg');
    var body = $('users-body');
    if (!AuthStore.isAdmin()) {
      if (body) body.innerHTML = '<tr><td colspan="6">Sem permissão (admin).</td></tr>';
      showMsg('users-msg', 'Faça login com conta admin.', false);
      return;
    }
    try {
      allUsers = await directProfiles();
      renderUsers();
    } catch (e) {
      if (body) body.innerHTML = '<tr><td colspan="6">Erro ao carregar.</td></tr>';
      showMsg('users-msg', String(e.message || e), false);
    }
  }

  async function loadSettings() {
    try {
      var c = getClient();
      var { data, error } = await c.from('app_settings').select('key,value');
      if (error) throw error;
      (data || []).forEach(function (row) {
        var v = row.value;
        if (v && typeof v === 'object' && 'value' in v) v = v.value;
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} }
        if (row.key === 'site_name') $('set-site').value = v || 'OpenTv';
        if (row.key === 'default_language') $('set-lang').value = v || 'pt';
        if (row.key === 'subtitle_default_size') $('set-sub-size').value = String(v || 1);
      });
    } catch (e) {
      showMsg('settings-msg', e.message || String(e), false);
    }
  }

  async function saveSettings() {
    hideMsg('settings-msg');
    try {
      var c = getClient();
      var payload = [
        { key: 'site_name', value: JSON.stringify($('set-site').value), updated_at: new Date().toISOString() },
        { key: 'default_language', value: JSON.stringify($('set-lang').value), updated_at: new Date().toISOString() },
        { key: 'subtitle_default_size', value: JSON.stringify(parseFloat($('set-sub-size').value)), updated_at: new Date().toISOString() }
      ];
      var { error } = await c.from('app_settings').upsert(payload, { onConflict: 'key' });
      if (error) throw error;
      showMsg('settings-msg', 'Configurações salvas.', true);
      try {
        localStorage.setItem('unitv_lang', $('set-lang').value);
        localStorage.setItem('unitv_subtitle_settings', JSON.stringify({ size: parseFloat($('set-sub-size').value), style: 0, delay: 0 }));
      } catch (e) {}
    } catch (e) {
      showMsg('settings-msg', e.message || String(e), false);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.nav-a[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.dataset.view); });
    });
    document.querySelectorAll('.filter-users').forEach(function (b) {
      b.addEventListener('click', function () {
        userFilter = b.dataset.filter;
        document.querySelectorAll('.filter-users').forEach(function (x) { x.classList.toggle('active', x === b); });
        renderUsers();
      });
    });
    $('btn-reload-users')?.addEventListener('click', loadUsers);
    $('btn-save-site')?.addEventListener('click', saveSettings);
    $('btn-adm-logout')?.addEventListener('click', function () {
      AuthStore.signOut().then(function () { location.href = 'login.html'; });
    });

    AuthStore.init().then(function () {
      var u = AuthStore.getUser();
      var p = AuthStore.getProfile();
      if (!u) { location.href = 'login.html?next=admin.html'; return; }
      $('who').textContent = (p && p.email) || u.email || '';
      if (p && p.role === 'admin') {
        loadUsers();
        loadSettings();
      } else {
        $('who').textContent += ' (sem admin)';
        showMsg('users-msg', 'Esta conta não é admin.', false);
      }
    }).catch(function () {
      location.href = 'login.html?next=admin.html';
    });
  });
})();
