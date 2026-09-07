// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NumsolisBoard } from "@/components/games/numsolis-board";
import { createNumsolisState, applyMove, type NumsolisMove } from "@/lib/games/numsolis";
import { en } from "@/i18n/dictionaries/en";

function fixture() {
  return createNumsolisState([
    [{ id: 1, value: 8, suit: 0 }, { id: 2, value: 16, suit: 0 }],
    [{ id: 3, value: 16, suit: 0 }, { id: 4, value: 8, suit: 0 }],
    [{ id: 5, value: 4, suit: 1 }], [], [], [],
  ], "medium", 1);
}

function setup() {
  const state = fixture();
  const onMove = vi.fn(() => true);
  const view = render(<NumsolisBoard state={state} copy={en.numsolis} onMove={onMove} />);
  const board = screen.getByTestId("numsolis-board");
  vi.spyOn(board, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 600, bottom: 428, width: 600, height: 428, x: 0, y: 0, toJSON: () => ({}) });
  return { ...view, board, state, onMove, card: (id: number) => view.container.querySelector(`[data-card="${id}"]`)! };
}

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: vi.fn(() => false) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Numsolis board controls", () => {
  it("selects any suffix by tap and sends its first index to the destination", () => {
    const { card, onMove } = setup();
    fireEvent.click(card(1));
    expect(card(1).getAttribute("aria-pressed")).toBe("true");
    expect(card(2).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(card(4));
    expect(onMove).toHaveBeenCalledExactlyOnceWith({ from: 0, index: 0, to: 1 });
  });

  it("drags the whole suffix once, with the same move as tap", () => {
    const { card, board, onMove } = setup();
    fireEvent.pointerDown(card(1), { button: 0, clientX: 45, clientY: 20 });
    fireEvent.pointerMove(board, { clientX: 150, clientY: 70 });
    expect(screen.getByTestId("numsolis-drag").children).toHaveLength(2);
    fireEvent.pointerUp(board, { clientX: 150, clientY: 70 });
    expect(onMove).toHaveBeenCalledExactlyOnceWith({ from: 0, index: 0, to: 1 });
    expect(screen.queryByTestId("numsolis-drag")).toBeNull();
  });

  it.each(["pointerCancel", "Escape", "outside", "illegal"])("%s discards a drag without a move", (reason) => {
    const { card, board, onMove } = setup();
    fireEvent.pointerDown(card(1), { button: 0, clientX: 45, clientY: 20 });
    fireEvent.pointerMove(board, { clientX: 150, clientY: 70 });
    if (reason === "pointerCancel") fireEvent.pointerCancel(board);
    if (reason === "Escape") fireEvent.keyDown(board, { key: "Escape" });
    fireEvent.pointerUp(board, { clientX: reason === "outside" ? 700 : reason === "illegal" ? 250 : 150, clientY: 70 });
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.queryByTestId("numsolis-drag")).toBeNull();
  });

  it("uses scoped arrow/Enter keys and leaves keys outside the board untouched", () => {
    const { board, onMove } = setup();
    fireEvent.keyDown(board, { key: "Enter" });
    fireEvent.keyDown(board, { key: "ArrowRight" });
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onMove).toHaveBeenCalledExactlyOnceWith({ from: 0, index: 0, to: 1 });
    const event = new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true, bubbles: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("invalidates an unfinished gesture when cloud state replaces the board", () => {
    const { card, board, onMove, rerender } = setup();
    fireEvent.pointerDown(card(1), { button: 0, clientX: 45, clientY: 20 });
    fireEvent.pointerMove(board, { clientX: 150, clientY: 70 });
    rerender(<NumsolisBoard state={fixture()} copy={en.numsolis} onMove={onMove} />);
    fireEvent.pointerUp(board, { clientX: 150, clientY: 70 });
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.queryByTestId("numsolis-drag")).toBeNull();
  });

  it("releases a pending tap when pointer capture is lost, allowing the next drag", () => {
    const { card, board, onMove } = setup();
    fireEvent.pointerDown(card(1), { button: 0, clientX: 45, clientY: 20 });
    fireEvent.lostPointerCapture(board);
    fireEvent.pointerDown(card(1), { button: 0, clientX: 45, clientY: 20 });
    fireEvent.pointerMove(board, { clientX: 150, clientY: 70 });
    fireEvent.pointerUp(board, { clientX: 150, clientY: 70 });
    expect(onMove).toHaveBeenCalledExactlyOnceWith({ from: 0, index: 0, to: 1 });
  });

  it("renders the engine's lower-first cascade and closed source, not an intermediate board", () => {
    const { state, rerender, container, card } = setup();
    const action: NumsolisMove = { from: 0, index: 0, to: 1 };
    const next = applyMove(state, action)!;
    rerender(<NumsolisBoard state={next} copy={en.numsolis} onMove={() => false} />);
    expect(screen.getByTestId("numsolis-column-0").querySelectorAll("[data-card]")).toHaveLength(0);
    expect(Array.from(screen.getByTestId("numsolis-column-1").querySelectorAll<HTMLElement>("[data-card]")).map((node) => node.dataset.value)).toEqual(["16", "32"]);
    expect(container.querySelectorAll("[data-card]")).toHaveLength(3);
    expect(card(4).getAttribute("data-value")).toBe("32");
  });
});
