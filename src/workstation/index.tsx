import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/index.css';

const Workstation = () => {
    return (
        <div className="min-h-screen w-full bg-background text-foreground p-8">
            <header className="mb-8">
                <h1 className="text-4xl font-bold tracking-tight">TabBellus</h1>
                <p className="text-muted-foreground mt-2">Manage your focus spaces.</p>
            </header>
            <main>
                {/* Dashboard content */}
            </main>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Workstation />
    </React.StrictMode>
);
