window.OpenModHeaderSurface = {
  name: "sidePanel",
};

document.documentElement.dataset.surface = "sidePanel";

function setEditingRow(row) {
  document.querySelectorAll(".header-row.editing").forEach((activeRow) => {
    if (activeRow !== row) activeRow.classList.remove("editing");
  });
  if (row) row.classList.add("editing");
}

document.addEventListener("focusin", (event) => {
  const row = event.target.closest && event.target.closest(".header-row");
  if (row) setEditingRow(row);
});

document.addEventListener("focusout", (event) => {
  const row = event.target.closest && event.target.closest(".header-row");
  if (!row) return;

  setTimeout(() => {
    if (!row.contains(document.activeElement)) {
      row.classList.remove("editing");
    }
  }, 0);
});

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
