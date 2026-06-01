import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children, setPage }) {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) setPage('login');
  }, [currentUser, setPage]);

  if (!currentUser) return null;
  return children;
}
