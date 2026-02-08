import React, { useState } from 'react';
import { storage } from '../services/storage';
import { User } from '../types';
import { LogIn, Lock } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const user = storage.login(username, password);
    if (user) {
      onLogin(user);
    } else {
      setError('IDまたはパスワードが正しくありません (demo: admin/password, satou/password)');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
                <LogIn className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">PharmaPOP Entry</h1>
            <p className="text-slate-500 mt-2">社内システムへログインしてください</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">ログインID</label>
            <input
              type="text"
              required
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
              placeholder="例: admin または satou"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">パスワード</label>
            <div className="relative">
                <input
                    type="password"
                    required
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all pr-10"
                    placeholder="パスワードを入力"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                    <Lock size={18} />
                </div>
            </div>
          </div>
          
          {error && <div className="text-danger text-sm font-medium bg-red-50 p-3 rounded-lg">{error}</div>}

          <button
            type="submit"
            className="w-full bg-primary hover:bg-sky-600 text-white font-bold py-3 px-4 rounded-lg shadow-lg shadow-sky-200 transition-all transform active:scale-95"
          >
            ログイン
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
          <p>Demo Accounts:</p>
          <p className="mt-1">ID: <span className="font-mono bg-slate-100 px-1 rounded">admin</span> / Pass: <span className="font-mono bg-slate-100 px-1 rounded">password</span></p>
          <p className="mt-1">ID: <span className="font-mono bg-slate-100 px-1 rounded">satou</span> / Pass: <span className="font-mono bg-slate-100 px-1 rounded">password</span></p>
        </div>
      </div>
    </div>
  );
};