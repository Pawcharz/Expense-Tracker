import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import {
  loadRates,
  convert as convertImpl,
  getRate,
  formatAmount,
  SUPPORTED_CURRENCIES,
  CURRENCY_LABELS,
} from '../lib/currency';

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const { user } = useAuth();
  const [displayCurrency, setDisplayCurrency] = useState('PLN');
  const [rates, setRates] = useState(null);

  useEffect(() => {
    loadRates().then(setRates);
  }, []);

  useEffect(() => {
    if (!user) {
      setDisplayCurrency('PLN');
      return;
    }
    supabase
      .from('user_settings')
      .select('display_currency')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_currency) setDisplayCurrency(data.display_currency);
      });
  }, [user?.id]);

  const changeDisplayCurrency = useCallback(async (currency) => {
    setDisplayCurrency(currency);
    if (user) {
      await supabase
        .from('user_settings')
        .upsert({ user_id: user.id, display_currency: currency });
    }
  }, [user]);

  // Convert an amount from `from` into the user's display currency.
  const toDisplay = useCallback((amount, from) => {
    return convertImpl(amount, from || displayCurrency, displayCurrency, rates);
  }, [displayCurrency, rates]);

  // Generic pair conversion.
  const convertBetween = useCallback((amount, from, to) => {
    return convertImpl(amount, from, to, rates);
  }, [rates]);

  // Pre-computed rate, useful for vectorised aggregation loops.
  const rateTo = useCallback((from, to) => {
    return getRate(from, to || displayCurrency, rates);
  }, [displayCurrency, rates]);

  // Format an amount in any currency.
  const format = useCallback((amount, currency) => {
    return formatAmount(amount, currency || displayCurrency);
  }, [displayCurrency]);

  // Convert + format helper for the most common UI case.
  const formatDisplay = useCallback((amount, from) => {
    return formatAmount(toDisplay(amount, from), displayCurrency);
  }, [toDisplay, displayCurrency]);

  return (
    <CurrencyContext.Provider
      value={{
        displayCurrency,
        changeDisplayCurrency,
        rates,
        ratesReady: rates !== null,
        toDisplay,
        convertBetween,
        rateTo,
        format,
        formatDisplay,
        supportedCurrencies: SUPPORTED_CURRENCIES,
        currencyLabels: CURRENCY_LABELS,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
