export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
    this.position = null;
    this.pointerId = null;

    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerUp);
    canvas.addEventListener("lostpointercapture", this.handlePointerUp);
  }

  destroy() {
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
    this.canvas.removeEventListener("lostpointercapture", this.handlePointerUp);
  }

  handlePointerDown = (event) => {
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.active = true;
    this.position = this.toCanvasPoint(event);
  };

  handlePointerMove = (event) => {
    if (!this.active || event.pointerId !== this.pointerId) {
      return;
    }

    event.preventDefault();
    this.position = this.toCanvasPoint(event);
  };

  handlePointerUp = (event) => {
    if (event.pointerId !== this.pointerId) {
      return;
    }

    this.active = false;
    this.pointerId = null;
  };

  toCanvasPoint(event) {
    if (this.isPseudoLandscape()) {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;

      return {
        x: this.canvas.logicalWidth / 2 + dy,
        y: this.canvas.logicalHeight / 2 - dx,
      };
    }

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.logicalWidth / rect.width;
    const scaleY = this.canvas.logicalHeight / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  isPseudoLandscape() {
    return window.matchMedia("(orientation: portrait) and (max-width: 700px)").matches;
  }
}
