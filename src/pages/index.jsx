import Layout from "./Layout.jsx";

import Assistant from "./Assistant";
import SignIn from "./SignIn";
import SignUp from "./SignUp";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";

import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';

const PAGES = {
    
    Assistant: Assistant,
    
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

// Redirect component that checks auth status
function ConditionalRedirect() {
    const { isAuthenticated, isLoading } = useAuth();
    
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-stone-950">
                <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-white">Loading...</span>
                </div>
            </div>
        );
    }
    
    if (!isAuthenticated) {
        return <Navigate to="/signin" replace />;
    }
    
    return <Navigate to="/" replace />;
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Routes>            
            {/* Public routes */}
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            
            {/* Protected routes */}
            <Route 
                path="/" 
                element={
                    <ProtectedRoute>
                        <Layout currentPageName={currentPage}>
                            <Assistant />
                        </Layout>
                    </ProtectedRoute>
                } 
            />
            
            <Route 
                path="/assistant" 
                element={
                    <ProtectedRoute>
                        <Layout currentPageName={currentPage}>
                            <Assistant />
                        </Layout>
                    </ProtectedRoute>
                } 
            />
            
            {/* Catch all unmatched routes - redirect appropriately */}
            <Route path="*" element={<ConditionalRedirect />} />
        </Routes>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}