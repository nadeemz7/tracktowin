"use client";

import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useCallback, useEffect, useState, useTransition } from "react";
import type { ReactNode } from "react";

type ScorecardItem = {
  id: string;
  content: ReactNode;
};

type ScorecardReorderClientProps = {
  items: ScorecardItem[];
  onReorder: (formData: FormData) => Promise<void>;
  footer?: ReactNode;
};

type DragItem = {
  id: string;
};

const ITEM_TYPE = "scorecard-item";

function ScorecardDragCard({ id, onMove, children }: { id: string; onMove: (dragId: string, dropId: string) => void; children: ReactNode }) {
  const [{ isDragging }, dragRef, previewRef] = useDrag(
    () => ({
      type: ITEM_TYPE,
      item: { id },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [id]
  );

  const [, dropRef] = useDrop(
    () => ({
      accept: ITEM_TYPE,
      drop: (item: DragItem) => {
        if (!item || item.id === id) return;
        onMove(item.id, id);
      },
    }),
    [id, onMove]
  );

  const setWrapperRef = useCallback(
    (node: HTMLDivElement | null) => {
      previewRef(node);
      dropRef(node);
    },
    [previewRef, dropRef]
  );

  return (
    <div ref={setWrapperRef} className={`scorecard-dnd-item${isDragging ? " is-dragging" : ""}`}>
      <button type="button" ref={dragRef} className="scorecard-dnd-handle" aria-label="Drag to reorder" title="Drag to reorder">
        ::
      </button>
      {children}
    </div>
  );
}

export default function ScorecardReorderClient({ items, onReorder, footer }: ScorecardReorderClientProps) {
  const [orderedItems, setOrderedItems] = useState(items);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const moveItem = useCallback(
    (dragId: string, dropId: string) => {
      setOrderedItems((prev) => {
        const dragIndex = prev.findIndex((item) => item.id === dragId);
        const dropIndex = prev.findIndex((item) => item.id === dropId);
        if (dragIndex < 0 || dropIndex < 0 || dragIndex === dropIndex) {
          return prev;
        }
        const next = [...prev];
        const [removed] = next.splice(dragIndex, 1);
        next.splice(dropIndex, 0, removed);

        const formData = new FormData();
        formData.set("orderedIds", JSON.stringify(next.map((item) => item.id)));
        startTransition(() => {
          void onReorder(formData);
        });

        return next;
      });
    },
    [onReorder, startTransition]
  );

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="scorecard-grid scorecard-grid--dnd">
        {orderedItems.map((item) => (
          <ScorecardDragCard key={item.id} id={item.id} onMove={moveItem}>
            {item.content}
          </ScorecardDragCard>
        ))}
        {footer}
      </div>
    </DndProvider>
  );
}
