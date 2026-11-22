import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  Sparkles,
  User as UserIcon,
  X,
  ShieldCheck,
} from "lucide-react";
import {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  googleProvider,
  firebaseSignOut,
  type User,
} from "../utils/firebase";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onUserChanged: (user: User | null) => void;
  onTriggerCloudSync: () => Promise<void>;
  isCloudSyncing: boolean;
  lastCloudSyncTime: string | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserChanged,
  onTriggerCloudSync,
  isCloudSyncing,
  lastCloudSyncTime,
}) => {
  const [tab, setTab] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    if (!email || !email.includes("@")) {
      setAuthError("Podaj poprawny adres e-mail.");
      return;
    }

    if (password.length < 6) {
      setAuthError("Hasło musi mieć co najmniej 6 znaków.");
      return;
    }

    if (tab === "register" && password !== confirmPassword) {
      setAuthError("Hasła nie są identyczne.");
      return;
    }

    setIsLoading(true);
    try {
      if (tab === "register") {
        const userCred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        onUserChanged(userCred.user);
        setAuthSuccess("Konto zostało pomyślnie utworzone! Trwa synchronizacja danych...");
        await onTriggerCloudSync().catch(() => {});
        setTimeout(() => onClose(), 1500);
      } else {
        const userCred = await signInWithEmailAndPassword(auth, email.trim(), password);
        onUserChanged(userCred.user);
        setAuthSuccess("Zalogowano pomyślnie! Trwa pobieranie ustawień z chmury...");
        await onTriggerCloudSync().catch(() => {});
        setTimeout(() => onClose(), 1500);
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      let msg = "Wystąpił błąd podczas autoryzacji.";
      const code = err?.code || "";
      if (code === "auth/email-already-in-use") {
        msg = "Ten adres e-mail jest już zarejestrowany. Przejdź do zakładki Logowanie.";
      } else if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        msg = "Nieprawidłowy adres e-mail lub hasło.";
      } else if (code === "auth/weak-password") {
        msg = "Hasło jest zbyt słabe (wymagane min. 6 znaków).";
      } else if (code === "auth/operation-not-allowed") {
        msg =
          "Dostawca logowania e-mail/hasło wymaga włączenia w Firebase Console (Authentication > Sign-in method > Email/Password). Możesz także skorzystać z logowania Google.";
      } else if (err?.message) {
        msg = err.message;
      }
      setAuthError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setAuthSuccess(null);
    setIsLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      onUserChanged(result.user);
      setAuthSuccess(`Zalogowano jako ${result.user.displayName || result.user.email}!`);
      await onTriggerCloudSync().catch(() => {});
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      console.error("Google popup error:", err);
      setAuthError(err?.message || "Nie udało się zalogować przez Google.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await firebaseSignOut(auth);
      onUserChanged(null);
      setAuthSuccess("Wylogowano pomyślnie.");
    } catch (err: any) {
      setAuthError(err?.message || "Błąd wylogowania.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {currentUser ? (
          /* User Profile & Cloud Sync View */
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-600 text-white font-display text-lg font-black shadow-md shadow-rose-600/20">
                {currentUser.email ? currentUser.email.slice(0, 2).toUpperCase() : "DP"}
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Twoje Konto DarierPro
                </h3>
                <p className="text-xs text-slate-500 truncate max-w-[240px]">
                  {currentUser.email}
                </p>
              </div>
            </div>

            {/* Cloud Sync Status Card */}
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  <Cloud className="h-4 w-4 text-emerald-600" />
                  <span>Chmura Firebase Aktywna</span>
                </span>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Wszystkie Twoje ustawienia (Intervals API, FTP, waga, harmonogram zmianowy), zużycie komponentów oraz aktywności zapisują się automatycznie w chmurze.
              </p>
              {lastCloudSyncTime && (
                <div className="text-[11px] text-slate-500 pt-1 border-t border-emerald-200/60 dark:border-emerald-800/40">
                  Ostatnia synchronizacja: <strong>{new Date(lastCloudSyncTime).toLocaleTimeString("pl-PL")}</strong>
                </div>
              )}
            </div>

            {/* Manual Sync Now button */}
            <button
              type="button"
              disabled={isCloudSyncing}
              onClick={async () => {
                setAuthSuccess("Trwa wysyłanie danych do chmury...");
                await onTriggerCloudSync();
                setAuthSuccess("Wszystkie dane zostały pomyślnie zsynchronizowane!");
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 py-2.5 px-4 text-xs font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${isCloudSyncing ? "animate-spin" : ""}`} />
              <span>{isCloudSyncing ? "Zapisywanie w chmurze..." : "Synchronizuj z chmurą teraz"}</span>
            </button>

            {authSuccess && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{authSuccess}</span>
              </div>
            )}

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 py-2 text-xs font-bold transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Wyloguj się z aplikacji</span>
            </button>
          </div>
        ) : (
          /* Authentication Forms */
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Konto i Kopia w Chmurze
                </h3>
                <p className="text-xs text-slate-500">
                  Zapisuj automatycznie swoje aktywności, ustawienia i stan sprzętu.
                </p>
              </div>
            </div>

            {/* Tab switch: Register vs Login */}
            <div className="grid grid-cols-2 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setTab("register");
                  setAuthError(null);
                }}
                className={`rounded-lg py-1.5 transition-all ${
                  tab === "register"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                Rejestracja przez e-mail
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("login");
                  setAuthError(null);
                }}
                className={`rounded-lg py-1.5 transition-all ${
                  tab === "login"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                Logowanie
              </button>
            </div>

            {/* Error & Success Banners */}
            {authError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}
            {authSuccess && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{authSuccess}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleEmailAuth} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Adres e-mail:
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="twoj.mail@domena.pl"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Hasło:
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 znaków"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {tab === "register" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Powtórz hasło:
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Wpisz ponownie hasło"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white py-2.5 px-4 text-xs font-bold shadow-md shadow-rose-600/25 transition-all disabled:opacity-50 cursor-pointer mt-2"
              >
                {isLoading
                  ? "Przetwarzanie..."
                  : tab === "register"
                  ? "Zarejestruj konto e-mail"
                  : "Zaloguj się"}
              </button>
            </form>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
              <span className="flex-shrink mx-3 text-[11px] text-slate-400 font-semibold">
                lub
              </span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
            </div>

            {/* Google Sign In option */}
            <button
              type="button"
              disabled={isLoading}
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-200 py-2.5 px-4 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Zaloguj przez Google (1-klik)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
