import initialPosts from '../data/blog-posts.js';

const API = '/api/blog';
const localPreview = ['localhost', '127.0.0.1'].includes(location.hostname);
let publicPosts = initialPosts.filter(post => post.published);
let managedPosts = [];
let lastFocused;
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const formatDate = value => value ? new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

function message(id, text, error = false) {
  const element = $(id);
  element.textContent = text;
  element.className = 'admin-msg' + (text ? error ? ' error' : ' success' : '');
}

async function api(action, payload = {}) {
  const readOnly = ['listPublished', 'adminStatus'].includes(action);
  const response = await fetch(API + (readOnly ? '?action=' + action : ''), {
    method: readOnly ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: readOnly ? {} : { 'Content-Type': 'application/json' },
    ...(readOnly ? {} : { body: JSON.stringify({ action, payload }) })
  });
  let body;
  try { body = await response.json(); } catch { throw new Error('The blog service is temporarily unavailable. Please try again.'); }
  if (!response.ok || !body.ok) throw new Error(body.message || 'The request could not be completed. Please try again.');
  return body;
}

async function withButton(button, task, errorId) {
  button.disabled = true;
  try { await task(); } catch (error) { message(errorId, error.message, true); }
  finally { button.disabled = false; }
}

function showSection(name) {
  document.querySelectorAll('.admin-section').forEach(section => section.classList.remove('active'));
  $('section-' + name).classList.add('active');
}

function openOverlay(element) {
  lastFocused = document.activeElement;
  element.classList.add('open');
  document.body.style.overflow = 'hidden';
  element.querySelector('button, input')?.focus();
}

function closeOverlay(element) {
  element.classList.remove('open');
  document.body.style.overflow = '';
  lastFocused?.focus();
}

$('admin-trigger-btn').addEventListener('click', async () => {
  showSection('unavailable');
  $('admin-unavailable-msg').textContent = 'Checking blog access…';
  openOverlay($('admin-overlay'));
  try {
    const status = await api('adminStatus');
    if (status.loggedIn) { showSection('dashboard'); await renderManage(); }
    else if (status.adminConfigured) showSection('login');
    else if (status.setupAvailable) showSection('setup');
    else $('admin-unavailable-msg').textContent = 'Blog setup is not ready yet. The site owner needs to add the private setup key in the hosting account.';
  } catch (error) { $('admin-unavailable-msg').textContent = error.message; }
});
$('admin-close-btn').addEventListener('click', () => closeOverlay($('admin-overlay')));
$('post-modal-close').addEventListener('click', () => closeOverlay($('post-modal')));
[$('admin-overlay'), $('post-modal')].forEach(element => element.addEventListener('click', event => { if (event.target === element) closeOverlay(element); }));
document.addEventListener('keydown', event => {
  const open = document.querySelector('.admin-overlay.open, .post-modal.open');
  if (!open) return;
  if (event.key === 'Escape') closeOverlay(open);
  if (event.key === 'Tab') {
    const targets = [...open.querySelectorAll('button, input, select, a, [contenteditable]')].filter(element => element.getClientRects().length && !element.disabled);
    const first = targets[0], last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});

$('setup-btn').addEventListener('click', event => withButton(event.currentTarget, async () => {
  message('setup-msg', '');
  const password = $('setup-pw').value;
  if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
  if (password !== $('setup-pw2').value) throw new Error('Passwords do not match.');
  await api('setupAdmin', { setupKey: $('setup-key').value, password });
  ['setup-key', 'setup-pw', 'setup-pw2'].forEach(id => $(id).value = '');
  showSection('dashboard');
  await renderManage();
}, 'setup-msg'));

$('login-btn').addEventListener('click', event => withButton(event.currentTarget, async () => {
  message('login-msg', '');
  await api('verifyAdmin', { password: $('login-pw').value });
  $('login-pw').value = '';
  showSection('dashboard');
  await renderManage();
}, 'login-msg'));
$('login-pw').addEventListener('keydown', event => { if (event.key === 'Enter') $('login-btn').click(); });

function switchTab(name) {
  document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
  ['new-post', 'manage', 'settings'].forEach(tab => $('tab-' + tab).style.display = tab === name ? '' : 'none');
  if (name === 'manage') renderManage();
}
document.querySelectorAll('.admin-tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

document.querySelectorAll('.toolbar-btn').forEach(button => button.addEventListener('mousedown', event => {
  event.preventDefault();
  const command = button.dataset.cmd;
  if (command === 'h2' || command === 'h3') document.execCommand('formatBlock', false, command);
  else if (command === 'createLink') {
    const href = prompt('Enter a website or email link:');
    if (href && /^(https?:\/\/|mailto:|tel:)/i.test(href)) document.execCommand('createLink', false, href);
    else if (href) message('post-msg', 'Use a link beginning with https://, http://, mailto: or tel:.', true);
  } else document.execCommand(command, false, null);
  $('post-editor').focus();
}));

function clearEditor() {
  $('post-title').value = '';
  $('post-editor').innerHTML = '';
  $('editing-post-id').value = '';
  $('post-date').value = new Date().toISOString().slice(0, 10);
}
$('clear-editor-btn').addEventListener('click', () => { clearEditor(); message('post-msg', ''); });

async function savePost(published) {
  message('post-msg', '');
  const title = $('post-title').value.trim();
  if (!title) { message('post-msg', 'Please enter a title.', true); return; }
  if (!$('post-editor').textContent.trim()) { message('post-msg', 'Please write some content.', true); return; }
  const post = {
    id: $('editing-post-id').value || crypto.randomUUID(),
    title,
    category: $('post-category').value,
    date: $('post-date').value || new Date().toISOString().slice(0, 10),
    content: $('post-editor').innerHTML,
    published
  };
  $('publish-btn').disabled = $('draft-btn').disabled = true;
  try {
    const result = await api('upsertPost', { post });
    managedPosts = [result.post, ...managedPosts.filter(existing => existing.id !== post.id)];
    clearEditor();
    await renderPublicPosts();
    message('post-msg', published ? 'Post published successfully.' : 'Draft saved.');
  } catch (error) { message('post-msg', error.message, true); }
  finally { $('publish-btn').disabled = $('draft-btn').disabled = false; }
}
$('publish-btn').addEventListener('click', () => savePost(true));
$('draft-btn').addEventListener('click', () => savePost(false));

async function renderManage() {
  const list = $('manage-list');
  $('manage-error').style.display = 'none';
  list.innerHTML = '';
  $('manage-empty').style.display = 'none';
  try {
    managedPosts = (await api('listAll')).posts;
    $('manage-empty').style.display = managedPosts.length ? 'none' : '';
    managedPosts.forEach(post => {
      const row = document.createElement('div');
      row.className = 'post-list-item';
      row.innerHTML = `<div style="flex:1;min-width:0;"><div class="post-list-title">${escapeHtml(post.title)} ${post.published ? '' : '<span class="post-draft-badge">Draft</span>'}</div><div class="post-list-meta">${escapeHtml(post.category)} &middot; ${escapeHtml(formatDate(post.date))}</div></div><div class="post-list-actions"><button class="post-action-btn edit">Edit</button><button class="post-action-btn del">Delete</button></div>`;
      row.querySelector('.edit').addEventListener('click', () => {
        $('post-title').value = post.title;
        $('post-category').value = post.category;
        $('post-date').value = post.date;
        $('post-editor').innerHTML = post.content;
        $('editing-post-id').value = post.id;
        message('post-msg', '');
        switchTab('new-post');
      });
      row.querySelector('.del').addEventListener('click', async event => {
        if (!confirm('Delete this post? This cannot be undone.')) return;
        event.currentTarget.disabled = true;
        try { await api('deletePost', { postId: post.id }); await renderManage(); await renderPublicPosts(); }
        catch (error) { $('manage-error').textContent = error.message; $('manage-error').style.display = ''; row.querySelector('.del').disabled = false; }
      });
      list.appendChild(row);
    });
  } catch (error) { $('manage-error').textContent = error.message; $('manage-error').style.display = ''; }
}

$('change-pw-btn').addEventListener('click', event => withButton(event.currentTarget, async () => {
  message('settings-msg', '');
  if ($('new-pw').value.length < 12) throw new Error('Use a password with at least 12 characters.');
  if ($('new-pw').value !== $('new-pw2').value) throw new Error('New passwords do not match.');
  await api('changeAdminPassword', { currentPassword: $('curr-pw').value, newPassword: $('new-pw').value });
  ['curr-pw', 'new-pw', 'new-pw2'].forEach(id => $(id).value = '');
  message('settings-msg', 'Password updated. Other sessions have been signed out.');
}, 'settings-msg'));
$('logout-btn').addEventListener('click', event => withButton(event.currentTarget, async () => {
  await api('logout');
  managedPosts = [];
  clearEditor();
  showSection('login');
  closeOverlay($('admin-overlay'));
}, 'settings-msg'));

function excerpt(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  const text = container.textContent || '';
  return text.length > 150 ? text.slice(0, 150).trim() + '…' : text;
}

function displayPublicPosts() {
  const grid = $('blog-posts-grid');
  grid.innerHTML = '';
  $('no-posts-msg').style.display = publicPosts.length ? 'none' : '';
  $('topics-section').style.display = publicPosts.length ? 'none' : '';
  publicPosts.forEach(post => {
    const card = document.createElement('div');
    card.className = 'blog-post-card';
    card.innerHTML = `<div class="blog-card-body"><div class="blog-card-meta"><span class="blog-card-cat">${escapeHtml(post.category)}</span><span class="blog-card-date">${escapeHtml(formatDate(post.date))}</span></div><h3 class="blog-card-title">${escapeHtml(post.title)}</h3><p class="blog-card-excerpt">${escapeHtml(excerpt(post.content))}</p></div><div class="blog-card-footer"><a href="#article" class="blog-read-more">Read Article &#8594;</a><span class="blog-author">The Fifth Table</span></div>`;
    card.querySelector('.blog-read-more').addEventListener('click', event => {
      event.preventDefault();
      $('modal-cat').textContent = post.category;
      $('modal-title').textContent = post.title;
      $('modal-meta').textContent = `${formatDate(post.date)} · The Fifth Table`;
      $('modal-content').innerHTML = post.content;
      openOverlay($('post-modal'));
    });
    grid.appendChild(card);
  });
}

async function renderPublicPosts() {
  displayPublicPosts();
  try {
    publicPosts = (await api('listPublished')).posts;
    displayPublicPosts();
  } catch {
    if (!publicPosts.length) $('no-posts-msg').querySelector('p').textContent = 'Articles are temporarily unavailable. Please check back soon.';
  }
}

clearEditor();
renderPublicPosts();

if (localPreview) {
  const notice = document.createElement('p');
  notice.textContent = 'Local preview · Changes stay on this computer. Blog test edits reset when the preview server restarts.';
  notice.style.cssText = 'font-size:.75rem;margin-bottom:1rem;color:var(--text-gray)';
  document.querySelector('.admin-body').prepend(notice);
}
if (location.hash === '#admin') $('admin-trigger-btn').click();
