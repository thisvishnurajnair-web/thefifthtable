import { enhanceRail } from './horizontal-rail.js?v=horizontal-review-1';

const galleries = [...document.querySelectorAll('[data-project-gallery]')];
const localHost = ['localhost', '127.0.0.1'].includes(location.hostname);
const previewMode = localHost ? new URLSearchParams(location.search).get('preview') : null;
const ideaView = previewMode === 'ideas';
const sampleView = previewMode === 'gallery' || ideaView;
const samplePhotos = [
  { src: 'images/hospitality/hospitality-space.jpg', width:1800, height:2520 },
  { src: 'images/hospitality/kitchen.jpg', width:1000, height:667 },
  { src: 'images/hospitality/restaurant-space.jpg', width:1400, height:924 },
  { src: 'images/hospitality/barista.jpg', width:1000, height:1500 }
];
const photoIdeas = [
  { src:'images/hospitality/options/green-cafe.jpg', width:1400, height:2100, title:'01 · A café among the greenery', author:'Nguyen Phuc Hau', source:'https://unsplash.com/photos/cozy-cafe-interior-with-wooden-tables-and-lush-plants-FxcSWWu98Ys', note:'Warm timber and lush plants; my closest match for the relaxed feeling you liked.' },
  { src:'images/hospitality/options/quiet-corner.jpg', width:1400, height:2100, title:'02 · A quiet café corner', author:'Roman', source:'https://unsplash.com/photos/interior-of-a-cafe-with-plants-and-seating-M5IdzhyYl1k', note:'Soft ivory walls, a timber table and greenery; a good fit for the website’s palette.' },
  { src:'images/hospitality/options/rattan-window.jpg', width:1400, height:2070, title:'03 · Natural light and rattan', author:'Salman Rameli', source:'https://unsplash.com/photos/wooden-chairs-and-table-near-a-window-with-plants-aloWEvoPm6Y', note:'A brighter detail photograph with natural materials and window light.' },
  { src:'images/hospitality/options/window-cafe.jpg', width:1400, height:2100, title:'04 · A warm evening café', author:'Roman', source:'https://unsplash.com/photos/cozy-cafe-interior-with-plants-and-tables-K3QN8cdLgyk', note:'A more intimate mood with warm lighting, wooden furniture and plants.' }
];
const previewPhotos = ideaView ? photoIdeas : samplePhotos;
let photos = [];
let viewerPhotos = [];
let viewing = 0;
let lastPhoto;

const dialog = document.createElement('dialog');
dialog.className = 'project-photo-dialog';
dialog.setAttribute('aria-label', 'Photograph viewer');
dialog.innerHTML = `<div class="photo-viewer-toolbar"><span id="photo-viewer-count" aria-live="polite"></span><button type="button" data-close aria-label="Close photograph">Close ×</button></div><img alt="" /><div class="photo-viewer-navigation"><button type="button" data-previous aria-label="Previous photograph">← Previous</button><button type="button" data-next aria-label="Next photograph">Next →</button></div>`;
document.body.append(dialog);

function viewPhoto(index, collection = viewerPhotos) {
  viewerPhotos = collection;
  viewing = (index + viewerPhotos.length) % viewerPhotos.length;
  const image = dialog.querySelector('img');
  image.src = viewerPhotos[viewing].src;
  image.alt = viewerPhotos[viewing].alt || 'Hospitality project photograph ' + (viewing + 1);
  dialog.querySelector('#photo-viewer-count').textContent = `${viewing + 1} / ${viewerPhotos.length}`;
  dialog.querySelector('.photo-viewer-navigation').hidden = viewerPhotos.length < 2;
}
dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
dialog.querySelector('[data-previous]').addEventListener('click', () => viewPhoto(viewing - 1));
dialog.querySelector('[data-next]').addEventListener('click', () => viewPhoto(viewing + 1));
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') { event.preventDefault(); viewPhoto(viewing - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); viewPhoto(viewing + 1); }
});
dialog.addEventListener('close', () => { document.body.style.overflow = ''; lastPhoto?.focus(); });

async function loadPhotos() {
  if (sampleView) {
    const status = await fetch('/__preview/status').then(response => response.ok ? response.json() : null).catch(() => null);
    if (status?.projectAdminPreview) return previewPhotos;
  }
  const response = await fetch('/api/projects', { cache: 'no-store' });
  if (!response.ok) throw new Error('The gallery could not be loaded. Please try refreshing the page.');
  const result = await response.json();
  if (!result.ok || !Array.isArray(result.photos)) throw new Error('The gallery could not be loaded. Please try refreshing the page.');
  return result.photos;
}

export async function renderPhotos() {
  photos = (await loadPhotos()).filter(photo => /^\/api\/projects\?photo=[a-f0-9-]{36}$/.test(photo.src) || (sampleView && previewPhotos.some(sample => sample.src === photo.src)));
  for (const gallery of galleries) {
    gallery.replaceChildren();
    const limit = Number(gallery.dataset.limit) || photos.length;
    for (const [index, photo] of photos.slice(0, limit).entries()) {
      const link = document.createElement('a');
      link.href = photo.src;
      link.className = 'project-photograph';
      if (photo.width > 0 && photo.height > 0) link.style.setProperty('--photo-ratio', photo.width / photo.height);
      link.setAttribute('aria-label', 'View project photograph ' + (index + 1));
      const image = document.createElement('img');
      image.src = photo.src;
      image.alt = 'Hospitality project photograph ' + (index + 1);
      image.loading = 'lazy';
      image.decoding = 'async';
      if (photo.width && photo.height) { image.width = photo.width; image.height = photo.height; }
      link.append(image);
      link.addEventListener('click', event => {
        event.preventDefault(); lastPhoto = link; viewPhoto(index, photos);
        document.body.style.overflow = 'hidden'; dialog.showModal();
      });
      if (ideaView && photo.source) {
        const item = document.createElement('figure'); item.className = 'project-photo-option';
        const caption = document.createElement('figcaption');
        const title = document.createElement('h2'); title.textContent = photo.title;
        const note = document.createElement('p'); note.textContent = photo.note;
        const source = document.createElement('a'); source.href = photo.source; source.textContent = photo.author + ' · View on Unsplash ↗'; source.target = '_blank'; source.rel = 'noopener noreferrer';
        caption.append(title, note, source); item.append(link, caption); gallery.append(item);
      } else gallery.append(link);
    }
    const empty = gallery.closest('section').querySelector('[data-gallery-empty]');
    if (empty) empty.hidden = gallery.childElementCount > 0;
    enhanceRail(gallery, 'Project photographs');
  }
  const notice = document.getElementById('gallery-sample-notice');
  if (notice) {
    notice.hidden = !sampleView || !photos.some(photo => photo.src.startsWith('images/hospitality/'));
    if (ideaView && !notice.hidden) {
      notice.querySelector('strong').textContent = 'Four more photo options';
      notice.querySelector('p').textContent = 'Stock photography for hospitality inspiration only.';
      document.querySelector('.gallery-heading h1').textContent = 'Photo ideas.';
      document.querySelector('.gallery-introduction').textContent = 'Four photographs with the warmth, natural materials and greenery you liked.';
      document.querySelector('.gallery-closing').hidden = true;
      document.title = 'Photography Options | The Fifth Table';
    }
  }
}

renderPhotos().catch(error => {
  document.querySelectorAll('[data-gallery-empty]').forEach(element => { element.hidden = false; element.textContent = error.message; });
});
