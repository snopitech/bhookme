import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function GoogleSignInButton() {
  const buttonRef = useRef(null);
  const { googleLogin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!window.google || !buttonRef.current) return;

    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: async (response) => {
        const result = await googleLogin(response.credential);
        if (result.success) {
          navigate('/');
        }
      },
    });

    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline',
      size: 'large',
      // Google's button doesn't accept percentage widths - it only
      // accepts specific pixel values. 300px matches the visual width
      // of the Yahoo and Microsoft buttons next to it.
      width: 300,
      text: 'continue_with',
    });
  }, [googleLogin, navigate]);

  return <div ref={buttonRef} className="w-full flex justify-center" />;
}