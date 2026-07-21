import { useEffect, useState } from 'react';
import { Folder, FolderOpen, ChevronRight, ChevronDown, Globe } from 'lucide-react';
import { bookmarkService } from '@/lib/bookmarkService';

interface BookmarkNodeProps {
    node: chrome.bookmarks.BookmarkTreeNode;
    depth: number;
}

const BookmarkNode = ({ node, depth }: BookmarkNodeProps) => {
    const isFolder = !!node.children;
    const [isOpen, setIsOpen] = useState(depth === 0); // Root is open by default

    if (isFolder) {
        // Skip rendering empty roots or nodes that don't have titles (e.g. system root)
        const hasVisibleChildren = node.children && node.children.length > 0;
        const isSystemRoot = node.id === '0';

        if (isSystemRoot) {
            return (
                <div className="space-y-0.5">
                    {node.children?.map((child) => (
                        <BookmarkNode key={child.id} node={child} depth={depth} />
                    ))}
                </div>
            );
        }

        return (
            <div className="select-none">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-foreground font-medium rounded hover:bg-muted transition-colors text-left"
                    style={{ paddingLeft: `${depth * 8 + 8}px` }}
                >
                    <span className="text-muted-foreground flex-shrink-0">
                        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </span>
                    <span className="text-primary flex-shrink-0">
                        {isOpen ? <FolderOpen className="w-3.5 h-3.5 fill-primary/10" /> : <Folder className="w-3.5 h-3.5 fill-primary/10" />}
                    </span>
                    <span className="truncate">{node.title || 'Untitled'}</span>
                </button>
                {isOpen && hasVisibleChildren && (
                    <div className="mt-0.5 space-y-0.5">
                        {node.children?.map((child) => (
                            <BookmarkNode key={child.id} node={child} depth={depth + 1} />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Bookmark item
    const handleClick = () => {
        if (node.url) {
            chrome.tabs.create({ url: node.url, active: true }).catch(() => {});
        }
    };

    const tryParseDomain = (url: string) => {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch {
            return '';
        }
    };

    return (
        <button
            onClick={handleClick}
            className="w-full flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors text-left"
            style={{ paddingLeft: `${depth * 8 + 20}px` }}
        >
            <Globe className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
            <span className="truncate flex-1 font-normal text-foreground/90">{node.title || tryParseDomain(node.url || '')}</span>
            {node.url && (
                <span className="text-[10px] text-muted-foreground/40 font-normal pr-1 truncate max-w-[100px] hidden sm:inline">
                    {tryParseDomain(node.url)}
                </span>
            )}
        </button>
    );
};

export const BookmarkPopoverContent = () => {
    const [tree, setTree] = useState<chrome.bookmarks.BookmarkTreeNode[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        bookmarkService.getBookmarkTree()
            .then((data) => {
                setTree(data);
                setLoading(false);
            })
            .catch(() => {
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="p-4 text-xs text-muted-foreground text-center">
                Loading bookmarks...
            </div>
        );
    }

    if (tree.length === 0) {
        return (
            <div className="p-4 text-xs text-muted-foreground text-center">
                No bookmarks found
            </div>
        );
    }

    return (
        <div className="max-h-[350px] overflow-y-auto pr-1 py-1 space-y-0.5">
            {tree.map((rootNode) => (
                <BookmarkNode key={rootNode.id} node={rootNode} depth={0} />
            ))}
        </div>
    );
};
