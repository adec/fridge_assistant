/* Pointer handles work with mouse, pen and touch, without disabling list scrolling. */
export function mergeVisibleOrder(full, visible) {
  const selected = new Set(visible);
  let index = 0;
  return full.map(id => selected.has(id) ? visible[index++] : id);
}

export function bindReorder(list, { save, label, announcement }) {
  const rows = () => Array.from(list.querySelectorAll('[data-reorder-id]'));
  const order = () => rows().map(row => row.dataset.reorderId);
  const status = document.createElement('div');
  status.className = 'reorder-status'; status.setAttribute('aria-live', 'polite');
  list.append(status);
  let drag = null, frame = null;
  const restore = ids => ids.forEach(id => {
    const row = rows().find(r => r.dataset.reorderId === id);
    if (row) list.insertBefore(row, status);
  });
  const commit = (ids, handle) => {
    const focused = handle.getRootNode().activeElement === handle;
    const id = handle.closest("[data-reorder-id]").dataset.reorderId;
    Promise.resolve(save(ids)).finally(() => {
      if (focused && list.isConnected) rows().find(row => row.dataset.reorderId === id)?.querySelector("[data-reorder-handle]").focus();
    });
  };
  const finish = cancelled => {
    if (!drag) return;
    const previous = drag.original, handle = drag.handle;
    drag.row.classList.remove('reorder-dragging');
    drag = null;
    cancelAnimationFrame(frame);
    if (cancelled) restore(previous);
    else if (order().join('\0') !== previous.join('\0')) commit(order(), handle);
    if (handle.hasPointerCapture?.(handle._reorderPointer)) handle.releasePointerCapture(handle._reorderPointer);
  };
  const place = () => {
    for (const row of rows()) {
      if (row === drag.row) continue;
      const rect = row.getBoundingClientRect();
      if (drag.y < rect.top + rect.height / 2) {
        list.insertBefore(drag.row, row); break;
      }
      list.insertBefore(drag.row, row.nextSibling);
    }
  };
  const position = () => {
    if (!drag || !list.isConnected) { finish(true); return; }
    place();
    // Scroll the modal near its edges so long lists remain reorderable on phones.
    let scroll = list.parentElement;
    while (scroll && scroll.scrollHeight <= scroll.clientHeight) scroll = scroll.parentElement;
    if (scroll) {
      const rect = scroll.getBoundingClientRect();
      const delta = drag.y < rect.top + 48 ? -8 : drag.y > rect.bottom - 48 ? 8 : 0;
      if (delta) scroll.scrollTop += delta;
    }
    frame = requestAnimationFrame(position);
  };
  const handlers = [];
  for (const row of rows()) {
    const handle = row.querySelector('[data-reorder-handle]');
    handle.setAttribute('aria-label', label(row.dataset.reorderId));
    const down = e => {
      if (handle.disabled || e.button !== 0 || drag) return;
      e.preventDefault();
      drag = { row, handle, original: order(), y: e.clientY };
      handle._reorderPointer = e.pointerId;
      handle.setPointerCapture(e.pointerId);
      row.classList.add('reorder-dragging');
      frame = requestAnimationFrame(position);
    };
    const move = e => { if (drag?.handle === handle) { e.preventDefault(); drag.y = e.clientY; place(); } };
    const up = e => { if (drag?.handle === handle) { drag.y = e.clientY; place(); finish(false); } };
    const cancel = () => { if (drag?.handle === handle) finish(true); };
    const key = e => {
      if (e.key === 'Escape') { finish(true); return; }
      if (handle.disabled || !['ArrowUp','ArrowDown','Home','End'].includes(e.key)) return;
      e.preventDefault();
      const ids = order(), index = ids.indexOf(row.dataset.reorderId);
      const target = e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : Math.max(0, Math.min(ids.length - 1, index + (e.key === 'ArrowUp' ? -1 : 1)));
      if (target === index) return;
      ids.splice(index,1); ids.splice(target,0,row.dataset.reorderId);
      handle.focus();
      restore(ids); status.textContent = announcement(target+1, ids.length);
      commit(ids, handle);
    };
    const events = {pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,lostpointercapture:cancel,keydown:key};
    for (const [name,fn] of Object.entries(events)) handle.addEventListener(name,fn);
    handlers.push(() => { for (const [name,fn] of Object.entries(events)) handle.removeEventListener(name,fn); });
  }
  return () => { finish(true); handlers.forEach(fn => fn()); status.remove(); };
}
