// ─── Country Configuration ─────────────────────────────────────────────
//
// Central registry for all supported countries.
// Everything country-specific (map center, search scope, language, features)
// is derived from here — never hardcoded elsewhere.
//
// Adding a new country:
//   1. Add a new entry to COUNTRIES below.
//   2. Add the code to CountryCode union.
//   3. Add to COUNTRY_LIST so the picker shows it.
//   That's it — no other files need touching for basic support.

export type CountryCode = 'BG' | 'NO' | 'SE' | 'FI'

export interface CountryFeatures {
  /** Whether this country has average-speed camera section data. */
  speedSections: boolean
}

export interface CountryConfig {
  code:        CountryCode
  name:        string                              // English display name
  nativeName:  string                              // name in native language
  flag:        string                              // emoji flag
  center:      [number, number]                    // [lat, lng] default map center
  zoom:        number                              // default map zoom
  minZoom:     number
  searchCode:  string                              // Nominatim countrycodes param
  searchLang:  string                              // Accept-Language for Nominatim + reverse geocode
  bounds:      [[number, number], [number, number]] // [[sw lat,lng], [ne lat,lng]]
  locale:      'bg' | 'en' | 'no' | 'sv' | 'fi'   // default UI locale
  features:    CountryFeatures                     // which product features are active
}

export const COUNTRIES: Record<CountryCode, CountryConfig> = {
  BG: {
    code:       'BG',
    name:       'Bulgaria',
    nativeName: 'България',
    flag:       '🇧🇬',
    center:     [42.6977, 23.3219],    // Sofia
    zoom:       15,
    minZoom:    6,
    searchCode: 'bg',
    searchLang: 'bg,en',
    bounds:     [[41.235, 22.36], [44.215, 28.609]],
    locale:     'bg',
    features: {
      speedSections: true,   // 47 BG average-speed sections in dataset
    },
  },

  NO: {
    code:       'NO',
    name:       'Norway',
    nativeName: 'Norge',
    flag:       '🇳🇴',
    center:     [59.9139, 10.7522],    // Oslo
    zoom:       15,
    minZoom:    5,
    searchCode: 'no',
    searchLang: 'en,no',
    bounds:     [[57.959, 4.479], [71.182, 31.293]],
    locale:     'no',
    features: {
      speedSections: true,   // Norwegian ATK average-speed sections
    },
  },

  SE: {
    code:       'SE',
    name:       'Sweden',
    nativeName: 'Sverige',
    flag:       '🇸🇪',
    center:     [59.3293, 18.0686],    // Stockholm
    zoom:       15,
    minZoom:    5,
    searchCode: 'se',
    searchLang: 'en,sv',
    bounds:     [[55.337, 11.120], [69.060, 24.166]],
    locale:     'sv',
    features: {
      speedSections: true,   // Swedish sträckmätning (average-speed sections)
    },
  },

  FI: {
    code:       'FI',
    name:       'Finland',
    nativeName: 'Suomi',
    flag:       '🇫🇮',
    center:     [60.1699, 24.9384],    // Helsinki
    zoom:       15,
    minZoom:    5,
    searchCode: 'fi',
    searchLang: 'en,fi',
    bounds:     [[59.808, 20.550], [70.093, 31.587]],
    locale:     'fi',
    features: {
      speedSections: true,   // Finnish jaksonopeudenvalvonta sections
    },
  },
}

// Ordered list used by the country picker UI
export const COUNTRY_LIST: CountryConfig[] = [
  COUNTRIES.BG,
  COUNTRIES.NO,
  COUNTRIES.SE,
  COUNTRIES.FI,
]
