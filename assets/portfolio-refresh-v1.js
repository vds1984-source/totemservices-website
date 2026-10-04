/* Filter only the refreshed portfolio; leave the shared site script unchanged. */
(() => {
  'use strict';
  const init = () => {
    document.querySelectorAll('[data-work-gallery]').forEach(gallery => {
      const items = Array.from(gallery.querySelectorAll('[data-work-item]'));
      const buttons = Array.from(gallery.querySelectorAll('[data-work-filter]'));
      const sections = Array.from(gallery.querySelectorAll('[data-work-section]'));
      const counter = gallery.querySelector('[data-work-count]');
      const videos = Array.from(gallery.querySelectorAll('video'));

      const applyFilter = filter => {
        let count = 0;
        items.forEach(item => {
          const categories = (item.dataset.category || '').split(/\s+/);
          const show = filter === 'all' || categories.includes(filter);
          item.hidden = !show;
          if (show) count += 1;
          else item.querySelectorAll('video').forEach(video => video.pause());
        });
        buttons.forEach(button => {
          const active = button.dataset.workFilter === filter;
          button.classList.toggle('active', active);
          button.setAttribute('aria-pressed', String(active));
        });
        sections.forEach(section => {
          const visible = Array.from(section.querySelectorAll('[data-work-item]')).filter(item => !item.hidden).length;
          section.hidden = visible === 0;
          const label = section.querySelector('[data-work-section-count]');
          const noun = section.dataset.workNoun || 'items';
          if (label) label.textContent = `${visible} ${visible === 1 ? noun.replace(/s$/, '') : noun}`;
        });
        if (counter) counter.textContent = `Showing ${count} portfolio ${count === 1 ? 'item' : 'items'}`;
      };

      buttons.forEach(button => button.addEventListener('click', () => applyFilter(button.dataset.workFilter)));
      videos.forEach(video => {
        video.addEventListener('play', () => videos.forEach(other => {
          if (other !== video && !other.paused) other.pause();
        }));
        const showFallback = () => {
          const card = video.closest('[data-work-item]');
          const fallback = card && card.querySelector('.work-video-fallback');
          if (fallback) fallback.hidden = false;
        };
        video.addEventListener('error', showFallback);
        video.querySelectorAll('source').forEach(source => source.addEventListener('error', showFallback));
      });
      applyFilter('all');
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();
})();
