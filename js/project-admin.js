import { renderPhotos } from './projects.js?v=project-inspiration-3';

const $ = id => document.getElementById(id);
const dialog = $('project-admin-dialog');
let localPreview = false;
let pending = [];
let busy = false;
let lastFocus;

function message(text, error = false) {
  $('project-admin-status').textContent = text;
  $('project-admin-status').classList.toggle('is-error', error);
}
function show(section) {
  dialog.querySelectorAll('[data-admin-section]').forEach(element => element.hidden = element.dataset.adminSection !== section);
}
async function result(response) {
  let body;
  try { body = await response.json(); } catch { throw new Error('The photo service is unavailable. Please try again.'); }
  if (!response.ok || !body.ok) {
    if (response.status === 401) { show('login'); $('project-admin-password').focus(); }
    throw new Error(body.message || 'The request could not be completed.');
  }
  return body;
}
const blog = (action, payload = {}) => fetch('/api/blog' + (action === 'adminStatus' ? '?action=adminStatus' : ''), {
  method: action === 'adminStatus' ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
  ...(action === 'adminStatus' ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) })
}).then(result);

async function run(task) {
  if (busy) return;
  busy = true;
  dialog.setAttribute('aria-busy', 'true');
  dialog.querySelectorAll('button, input').forEach(element => element.disabled = true);
  try { await task(); } catch (error) { message(error.message, true); }
  finally {
    busy = false; dialog.removeAttribute('aria-busy');
    dialog.querySelectorAll('button, input').forEach(element => element.disabled = false);
    $('project-upload-button').disabled = !pending.length;
  }
}

$('project-admin-open').addEventListener('click', async () => {
  lastFocus = document.activeElement; show('loading'); message('');
  dialog.showModal(); document.body.style.overflow = 'hidden';
  try {
    if (['localhost', '127.0.0.1'].includes(location.hostname)) {
      const status = await fetch('/__preview/status').then(response => response.ok ? response.json() : null).catch(() => null);
      localPreview = status?.projectAdminPreview === true;
    }
    const status = await blog('adminStatus');
    if (status.loggedIn) await dashboard();
    else if (localPreview) show('preview');
    else if (status.adminConfigured) { show('login'); $('project-admin-password').focus(); }
    else show('setup');
  } catch (error) { show('unavailable'); message(error.message, true); }
});
$('project-admin-close').addEventListener('click', () => { if (!busy) dialog.close(); });
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
dialog.addEventListener('close', () => { document.body.style.overflow = ''; $('project-admin-password').value = ''; lastFocus?.focus(); });
dialog.addEventListener('click', event => { if (event.target === dialog && !busy) dialog.close(); });
$('project-admin-login').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    message('Signing in…');
    await blog('verifyAdmin', { password: $('project-admin-password').value });
    $('project-admin-password').value = ''; await dashboard(); message('');
  });
});
$('project-preview-login').addEventListener('click', () => run(async () => {
  await fetch('/__preview/admin-session', { method: 'POST', credentials: 'same-origin' }).then(result);
  await dashboard(); message('Local preview ready. Photo changes stay on this computer.');
}));
$('project-admin-logout').addEventListener('click', () => run(async () => {
  await blog('logout');
  pending.forEach(photo => URL.revokeObjectURL(photo.url)); pending = []; renderPending();
  show(localPreview ? 'preview' : 'login'); message('Signed out.');
}));

function renderPending() {
  const list = $('project-pending-photos'); list.replaceChildren();
  pending.forEach((photo, index) => {
    const card = document.createElement('div'); card.className = 'pending-photo';
    const image = document.createElement('img'); image.src = photo.url; image.alt = `Selected photograph ${index + 1}`;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove selected photograph ${index + 1}`);
    remove.addEventListener('click', () => { if (busy) return; URL.revokeObjectURL(photo.url); pending.splice(index, 1); renderPending(); });
    card.append(image, remove); list.append(card);
  });
  $('project-upload-button').disabled = busy || !pending.length;
  $('project-upload-button').textContent = pending.length ? `Upload ${pending.length} photo${pending.length === 1 ? '' : 's'}` : 'Upload photos';
  $('project-selection-count').textContent = pending.length ? `${pending.length} selected · Review your photos before uploading.` : '';
}
$('project-photo-files').addEventListener('change', event => {
  message('');
  for (const file of event.target.files) {
    if (pending.length >= 12) { message('Upload up to 12 photos at a time.', true); break; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
      message('Choose JPG, PNG or WebP photos up to 20 MB each.', true); continue;
    }
    pending.push({ file, url: URL.createObjectURL(file) });
  }
  event.target.value = ''; renderPending();
});

async function preparePhoto(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('One of the photos could not be opened. Please choose another image.'); }
  const canvas = document.createElement('canvas');
  const ratio = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  for (const quality of [.86, .76, .64, .5]) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= 2 * 1024 * 1024) return blob;
  }
  throw new Error('One photo is too detailed to upload. Please choose a smaller version.');
}

$('project-upload-button').addEventListener('click', () => run(async () => {
  const total = pending.length; let uploaded = 0;
  try {
    // Reverse upload order preserves the user's selection order in the gallery.
    for (const photo of [...pending].reverse()) {
      message(`Uploading photo ${uploaded + 1} of ${total}…`);
      const body = await preparePhoto(photo.file);
      await fetch('/api/projects', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body }).then(result);
      URL.revokeObjectURL(photo.url); pending = pending.filter(item => item !== photo); uploaded++;
    }
    message(`${uploaded} photo${uploaded === 1 ? '' : 's'} uploaded. Your gallery is updated.`);
  } catch (error) { message(`${uploaded ? uploaded + ' photo(s) uploaded. ' : ''}${error.message}`, true); }
  finally { renderPending(); await refreshManager(); await renderPhotos(); }
}));

async function dashboard() {
  show('dashboard'); $('project-local-note').hidden = !localPreview;
  await refreshManager(); renderPending();
}
async function refreshManager() {
  const { photos } = await fetch('/api/projects', { cache: 'no-store' }).then(result);
  $('project-manage-count').textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'} in your gallery`;
  $('project-manage-empty').hidden = photos.length > 0;
  const list = $('project-manage-photos'); list.replaceChildren();
  photos.forEach((photo, index) => {
    const card = document.createElement('article'); card.className = 'managed-photo';
    const image = document.createElement('img'); image.src = photo.src; image.alt = `Gallery photograph ${index + 1}`; image.loading = 'lazy';
    const actions = document.createElement('div'); actions.className = 'managed-photo-actions';
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'photo-delete-button'; remove.textContent = 'Delete photo'; remove.setAttribute('aria-label', `Delete photograph ${index + 1}`);
    const confirmation = document.createElement('div'); confirmation.className = 'photo-delete-confirm'; confirmation.hidden = true;
    const question = document.createElement('p'); question.textContent = 'Delete from the website?';
    const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'photo-delete-button'; yes.textContent = 'Yes, delete';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    confirmation.append(question, yes, cancel);
    remove.addEventListener('click', () => { remove.hidden = true; confirmation.hidden = false; cancel.focus(); });
    cancel.addEventListener('click', () => { remove.hidden = false; confirmation.hidden = true; remove.focus(); });
    yes.addEventListener('click', () => run(async () => {
      await fetch('/api/projects?photo=' + encodeURIComponent(photo.id), { method: 'DELETE', credentials: 'same-origin' }).then(result);
      await refreshManager(); await renderPhotos(); message('Photo deleted from the gallery.'); $('project-manage-count').focus();
    }));
    actions.append(remove, confirmation); card.append(image, actions); list.append(card);
  });
}

if (location.hash === '#admin') $('project-admin-open').click();
