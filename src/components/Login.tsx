import React, { useState } from 'react';
import { dataService } from '../services/dataService';
import { User } from '../types';
import { Eye, EyeOff, LogIn } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void | Promise<void>;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const user = await dataService.login(username, password);
      if (user) {
        await onLogin(user);
      } else {
        setError('IDまたはパスワードが正しくありません');
      }
    } catch (err) {
      console.error('Login failed:', err);
      setError('ログイン処理に失敗しました。時間をおいて再試行してください。');
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
              placeholder="ログインIDを入力"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">パスワード</label>
            <div className="relative">
                <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all pr-10"
                    placeholder="パスワードを入力"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示する'}
                >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
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
      </div>
    </div>
  );
};
