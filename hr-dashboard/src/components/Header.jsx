import React from 'react';
import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="bg-yellow-500 text-gray-900">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/login" className="font-bold text-lg">
          bhookme HR
        </Link>
        <a
          href="https://bhookme.com"
          className="text-sm text-gray-800 hover:text-black"
        >
          Home
        </a>
      </div>
    </header>
  );
}