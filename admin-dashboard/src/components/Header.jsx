import React from 'react';
import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/login" className="font-bold text-lg">
          bhookme Admin
        </Link>
        <a
          href="https://bhookme.com"
          className="text-sm text-gray-300 hover:text-white"
        >
          Home
        </a>
      </div>
    </header>
  );
}