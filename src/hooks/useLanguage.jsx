import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import en from '../locales/en';
import pl from '../locales/pl';

const translations = { en, pl };
const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const { user } = useAuth();
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    if (!user) { setLanguage('en'); return; }
    supabase
      .from('user_settings')
      .select('language')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setLanguage(data.language);
        } else {
          supabase.from('user_settings').upsert({ user_id: user.id, language: 'en' });
        }
      });
  }, [user?.id]);

  async function changeLanguage(lang) {
    setLanguage(lang);
    if (user) {
      await supabase.from('user_settings').upsert({ user_id: user.id, language: lang });
    }
  }

  function t(key) {
    return translations[language]?.[key] ?? translations['en']?.[key] ?? key;
  }

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
