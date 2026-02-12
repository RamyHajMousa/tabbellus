import { Table } from 'dexie';
import { useToast } from '@/components/ui/Toaster';

/**
 * Hook to handle item deletion with undo functionality.
 * 
 * Pattern:
 * 1. Fetch item
 * 2. Delete item
 * 3. Show toast with Undo (which re-adds the item)
 */
export const useUndoDelete = <T>(table: Table<T, any>) => {
    const { toast } = useToast();

    /**
     * Deletes an item and shows an undo toast.
     * @param id The primary key of the item to delete
     * @param message Toast message (default: "Item deleted")
     */
    const deleteWithUndo = async (id: any, message: string = "Item deleted") => {
        try {
            // 1. Fetch before delete (Snapshot)
            const item = await table.get(id);
            if (!item) return;

            // 2. Delete
            await table.delete(id);

            // 3. Toast with Undo
            toast(message, {
                duration: 4000,
                onUndo: async () => {
                    await table.add(item);
                }
            });
        } catch (error) {
            console.error("Delete failed:", error);
            toast("Failed to delete item");
        }
    };

    return { deleteWithUndo };
};
