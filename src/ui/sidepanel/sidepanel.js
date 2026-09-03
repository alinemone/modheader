window.OpenModHeaderSurface = {
  name: "sidePanel",
};

document.documentElement.dataset.surface = "sidePanel";

/* The rail runs horizontally down here, so it needs wheel and drag scrolling
   that the vertical popup rail does not. */
const railProfiles = document.getElementById("railProfiles");
if (railProfiles) {
  let profileDrag = null;
  let suppressProfileClick = false;

  railProfiles.addEventListener(
    "wheel",
    (event) => {
      const canScroll = railProfiles.scrollWidth > railProfiles.clientWidth;
      if (!canScroll) return;

      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
      if (!delta) return;

      event.preventDefault();
      railProfiles.scrollLeft += delta;
    },
    { passive: false }
  );

  railProfiles.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (railProfiles.scrollWidth <= railProfiles.clientWidth) return;

    suppressProfileClick = false;
    profileDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: railProfiles.scrollLeft,
      moved: false,
    };
  });

  railProfiles.addEventListener("pointermove", (event) => {
    if (!profileDrag || profileDrag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - profileDrag.startX;
    if (Math.abs(deltaX) > 8) {
      profileDrag.moved = true;
      railProfiles.classList.add("is-dragging");
      if (!railProfiles.hasPointerCapture(event.pointerId)) {
        railProfiles.setPointerCapture(event.pointerId);
      }
    }

    if (profileDrag.moved) {
      event.preventDefault();
      railProfiles.scrollLeft = profileDrag.scrollLeft - deltaX;
    }
  });

  function stopProfileDrag(event) {
    if (!profileDrag || profileDrag.pointerId !== event.pointerId) return;

    if (railProfiles.hasPointerCapture(event.pointerId)) {
      railProfiles.releasePointerCapture(event.pointerId);
    }
    suppressProfileClick = profileDrag.moved;
    railProfiles.classList.remove("is-dragging");
    profileDrag = null;
  }

  railProfiles.addEventListener("pointerup", stopProfileDrag);
  railProfiles.addEventListener("pointercancel", stopProfileDrag);

  railProfiles.addEventListener(
    "click",
    (event) => {
      if (!suppressProfileClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressProfileClick = false;
    },
    true
  );
}
