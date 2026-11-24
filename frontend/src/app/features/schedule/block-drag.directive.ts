import { Directive, ElementRef, OnDestroy, inject, input, output, signal } from '@angular/core';

export interface BlockDragEvent {
  /** `start` once the pointer has moved far enough to be a drag; `drop` on release; `cancel` on Esc. */
  phase: 'start' | 'move' | 'drop' | 'cancel';
  dx: number;
  /** Vertical distance in the scrolled content: what the pointer moved plus what the planner scrolled meanwhile. */
  dy: number;
  /** Where the pointer is on screen, for a label that follows it. */
  x: number;
  y: number;
}

/** A pointer must move this far before a press becomes a drag; less is a click. */
const THRESHOLD = 5;
/** Within this many pixels of the top or bottom edge of the planner, it scrolls on its own. */
const EDGE = 48;
const MAX_SCROLL_PER_FRAME = 16;

/**
 * Lets a calendar block be dragged with a mouse or a pen. The block follows the pointer (a transform, so nothing in the
 * layout moves); the parent decides what the distance means and what to do on release. A touch screen keeps its own
 * gestures (scrolling, tapping to show the block's buttons), so touch pointers are ignored here.
 */
@Directive({
  selector: '[tfBlockDrag]',
  host: {
    '(pointerdown)': 'onDown($event)',
    // A link is draggable by the browser itself (it would start dragging its address and cancel the pointer events).
    '[attr.draggable]': '"false"',
    '(dragstart)': '$event.preventDefault()',
    '[class.block--draggable]': 'tfBlockDrag()',
    '[class.block--dragging]': 'dragging()',
  },
})
export class BlockDragDirective implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Bound as `[tfBlockDrag]="allowed"`: turned off while picking several tasks or while a change is in flight. */
  readonly tfBlockDrag = input(true);
  /** `y`: the block only moves up and down (the day view); `both` also sideways (the week view). */
  readonly axis = input<'y' | 'both'>('both');
  readonly drag = output<BlockDragEvent>();

  protected readonly dragging = signal(false);

  private session: { id: number; x0: number; y0: number; scroller: HTMLElement | null; scroll0: number; started: boolean; cancelled: boolean; last: PointerEvent } | null = null;
  private frame = 0;

  private readonly move = (event: PointerEvent): void => this.onMove(event);
  private readonly up = (event: PointerEvent): void => this.onUp(event);
  private readonly key = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.session?.started && !this.session.cancelled) {
      this.abandon();
    }
  };

  protected onDown(event: PointerEvent): void {
    // A missing pointerType (an old browser, a test) is a mouse. Only the main button drags.
    if (!this.tfBlockDrag() || this.session || event.button !== 0 || event.pointerType === 'touch') {
      return;
    }
    const scroller = this.host.nativeElement.closest<HTMLElement>('.board__scroll, .week__scroll');
    this.session = { id: event.pointerId, x0: event.clientX, y0: event.clientY, scroller, scroll0: scroller?.scrollTop ?? 0, started: false, cancelled: false, last: event };
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    document.addEventListener('keydown', this.key);
  }

  private onMove(event: PointerEvent): void {
    const s = this.session;
    if (!s || event.pointerId !== s.id || s.cancelled) {
      return;
    }
    s.last = event;
    if (!s.started) {
      if (Math.hypot(event.clientX - s.x0, event.clientY - s.y0) < THRESHOLD) {
        return;
      }
      s.started = true;
      this.dragging.set(true);
      this.host.nativeElement.setPointerCapture?.(s.id);
      this.emit('start');
      this.frame = requestAnimationFrame(() => this.autoScroll());
    }
    this.apply('move');
  }

  private onUp(event: PointerEvent): void {
    const s = this.session;
    if (!s || event.pointerId !== s.id) {
      return;
    }
    if (!s.started) {
      this.cleanup();
      return;
    }
    if (s.cancelled) {
      // Esc was pressed while the button was still down: the release still ends in a click, which must not open the task.
      if (event.type !== 'pointercancel') {
        this.swallowNextClick();
      }
      this.cleanup();
      return;
    }
    s.last = event;
    if (event.type === 'pointercancel') {
      this.abandon();
      this.cleanup();
      return;
    }
    this.emit('drop');
    this.putBack();
    this.swallowNextClick();
    this.cleanup();
  }

  /** Moves the block under the pointer and tells the parent how far it is from where it started. */
  private apply(phase: 'move' | 'drop'): void {
    const { dx, dy } = this.distance();
    this.host.nativeElement.style.transform = `translate(${dx}px, ${dy}px)`;
    this.emit(phase);
  }

  private distance(): { dx: number; dy: number } {
    const s = this.session!;
    const scrolled = s.scroller ? s.scroller.scrollTop - s.scroll0 : 0;
    return { dx: this.axis() === 'y' ? 0 : s.last.clientX - s.x0, dy: s.last.clientY - s.y0 + scrolled };
  }

  private emit(phase: BlockDragEvent['phase']): void {
    const { dx, dy } = this.distance();
    this.drag.emit({ phase, dx, dy, x: this.session!.last.clientX, y: this.session!.last.clientY });
  }

  /** Dragging near the top or bottom edge of the planner scrolls it, so a block can be carried to an hour out of view. */
  private autoScroll(): void {
    const s = this.session;
    if (!s?.started) {
      return;
    }
    if (s.scroller) {
      const box = s.scroller.getBoundingClientRect();
      const y = s.last.clientY;
      const speed = y < box.top + EDGE ? -(1 - Math.max(0, y - box.top) / EDGE) : y > box.bottom - EDGE ? 1 - Math.max(0, box.bottom - y) / EDGE : 0;
      if (speed !== 0) {
        const before = s.scroller.scrollTop;
        s.scroller.scrollTop += Math.round(speed * MAX_SCROLL_PER_FRAME);
        if (s.scroller.scrollTop !== before) {
          this.apply('move');
        }
      }
    }
    this.frame = requestAnimationFrame(() => this.autoScroll());
  }

  /** Esc or a cancelled pointer: the block goes back, nothing is saved. The press itself is over only on release. */
  private abandon(): void {
    this.session!.cancelled = true;
    this.emit('cancel');
    this.putBack();
    cancelAnimationFrame(this.frame);
  }

  private putBack(): void {
    this.host.nativeElement.style.transform = '';
    this.dragging.set(false);
  }

  /** The release of a drag is followed by a click on the block, which would open the task: swallow that one click. */
  private swallowNextClick(): void {
    const swallow = (event: Event): void => {
      event.stopImmediatePropagation();
      event.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    // If no click comes (the pointer was released somewhere else), the listener must not wait for an unrelated one.
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
  }

  private cleanup(): void {
    const s = this.session;
    if (s?.started) {
      this.host.nativeElement.releasePointerCapture?.(s.id);
    }
    cancelAnimationFrame(this.frame);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.up);
    document.removeEventListener('keydown', this.key);
    this.session = null;
    this.dragging.set(false);
  }

  ngOnDestroy(): void {
    this.cleanup();
  }
}
