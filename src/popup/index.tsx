import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/index.css';

const Popup = () => {
    return (
        <div className="w-[300px] h-[400px] p-4 bg-background text-foreground">
            <h1 className="text-xl font-bold mb-2">TabBellus</h1>
            <p className="text-sm text-muted-foreground">Workstation layer active.</p>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>
);
