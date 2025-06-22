// lib/i18n.ts
// This is a simplified version of the i18n system
// It will be re-introduced later with proper internationalization

export type SupportedLocale = "zh-CN";

export interface I18nConfig {
  defaultLocale: SupportedLocale;
  supportedLocales: SupportedLocale[];
}

export const i18nConfig: I18nConfig = {
  defaultLocale: "zh-CN",
  supportedLocales: ["zh-CN"],
};

export const localeNames: Record<SupportedLocale, string> = {
  "zh-CN": "简体中文",
};

// Simple function to help with migration
export function t(key: string, params?: Record<string, string | number>): string {
  // Just return the key for now - we'll extract hardcoded strings later
  return key;
}

// Stub functions to avoid errors
export function getBrowserLocale(): SupportedLocale {
  return "zh-CN";
}

export function getStoredLocale(): SupportedLocale {
  return "zh-CN";
}

export function setStoredLocale(): void {
  // Do nothing
}

export function isValidLocale(locale: string): locale is SupportedLocale {
  return locale === "zh-CN";
}
  common: {
    loading: string;
    save: string;
    cancel: string;
    delete: string;
    confirm: string;
    error: string;
    success: string;
    warning: string;
    info: string;
    reset: string;
    download: string;
    export: string;
    import: string;
    settings: string;
    about: string;
    home: string;
    back: string;
    next: string;
    previous: string;
    close: string;
    open: string;
    search: string;
    filter: string;
    sort: string;
    clear: string;
    refresh: string;
    retry: string;
  };

  // Navigation
  nav: {
    home: string;
    settings: string;
    about: string;
    gallery: string;
  };

  // Settings
  settings: {
    title: string;
    description: string;
    accessToken: string;
    accessTokenPlaceholder: string;
    teamId: string;
    batchSize: string;
    batchSizeHelper: string;
    saveSettings: string;
    loadingSettings: string;
    settingsSaved: string;
    settingsLoadingImages: string;
    invalidToken: string;
    tokenTooShort: string;
    saveSettingsFailed: string;
    needAccessToken: string;
    configureSettings: string;
    goToSettings: string;
    quickExport: string;
    viewFullExportOptions: string;
    afterSavingSettings: string;
    localStorageManagement: string;
    clearCurrentWorkspace: string;
    clearAllData: string;
    imagesCachedLocally: string;
  };
  // Gallery
  gallery: {
    title: string;
    subtitle: string;
    description: string;
    loading: string;
    loadingImages: string;
    noImages: string;
    noImagesFound: string;
    imageCount: string;
    loadMore: string;
    errorLoading: string;
    retryLoading: string;
    imageDetails: string;
    createdAt: string;
    dimensions: string;
    originalUrl: string;
    downloadImage: string;
    closeModal: string;
  };

  // Export
  export: {
    title: string;
    description: string;
    options: string;
    includeMetadata: string;
    metadataDescription: string;
    includeThumbnails: string;
    thumbnailsDescription: string;
    checkAndExport: string;
    processing: string;
    checking: string;
    preparing: string;
    downloading: string;
    complete: string;
    failed: string;
    downloadZip: string;
    manualDownload: string;
    reset: string;
    exportStart: string;
    exportSuccess: string;
    exportError: string;
    needToken: string;
    checkingExistingTask: string;
    foundExistingTask: string;
    useExistingTask: string;
    startNewExport: string;
    gettingImageList: string;
    imageListReady: string;
    downloadReady: string;
    exportComplete: string;
    exportFailed: string;
    noDownloadLink: string;
    invalidDownloadLink: string;
    downloadStarted: string;
    imagesIncluded: string;
    smartCheck: string;
    smartCheckDesc: string;
    streamProcessing: string;
    streamProcessingDesc: string;
    featureDescription: string;
    metadataProgress: string;
    batchProgress: string;
    imagesFound: string;
    exportReady: string;
    clickToDownload: string;
    realtimeGeneration: string;
  };

  // Teams
  teams: {
    teamManagement: string;
    currentTeams: string;
    addTeam: string;
    addTeamPlaceholder: string;
    removeTeam: string;
    savingTeamsFailed: string;
    loadingTeamSettings: string;
    recommendAutoSelection: string;
    personal: string;
    teamWorkspace: string;
    autoDetection: string;
    selectTeam: string;
  };

  // About
  about: {
    title: string;
    description: string;
    howToUse: string;
    gettingTokenAndTeam: string;
    loginToChatGPT: string;
    openDevTools: string;
    refreshPage: string;
    findAuthHeader: string;
    findTeamHeader: string;
    step1: string;
    step2: string;
    step3: string;
    step4: string;
    exportFeatures: string;
    zipExportFeature: string;
    batchExport: string;
    metadataSupport: string;
    smartNaming: string;
    backendProcessing: string;
    progressTracking: string;
    openSource: string;
    openSourceDesc: string;
    viewGitHub: string;
  };

  // Notifications
  notifications: {
    exportStarted: string;
    exportCompleted: string;
    exportFailed: string;
    settingsSaved: string;
    tokenRequired: string;
    invalidResponse: string;
    networkError: string;
    processingImages: string;
  };

  // Errors
  errors: {
    chatgptApiError: string;
    noImagesFound: string;
    exportFailed: string;
    downloadFailed: string;
    networkError: string;
    invalidToken: string;
    serverError: string;
    unknownError: string;
    parseError: string;
    sseError: string;
    unexpectedResponse: string;
    tokenRequired: string;
    checkTaskFailed: string;
  };

  // Theme
  theme: {
    toggle: string;
    light: string;
    dark: string;
    system: string;
  };
  // Language
  language: {
    selectLanguage: string;
    currentLanguage: string;
    changeLanguage: string;
  };

  // Page titles and meta
  meta: {
    galleryTitle: string;
    galleryDescription: string;
    settingsTitle: string;
    settingsDescription: string;
    notFoundTitle: string;
    notFoundHeading: string;
    notFoundMessage: string;
    notFoundHome: string;
    logoAlt: string;
  };
}

// Get browser locale with fallback
export function getBrowserLocale(): SupportedLocale {
  if (typeof window === "undefined") return i18nConfig.defaultLocale;

  const browserLang = navigator.language || navigator.languages?.[0];

  if (browserLang?.startsWith("zh")) {
    if (
      browserLang.includes("TW") || browserLang.includes("HK") ||
      browserLang.includes("MO")
    ) {
      return "zh-TW";
    }
    return "zh-CN";
  }

  if (browserLang?.startsWith("en")) {
    return "en";
  }

  return i18nConfig.defaultLocale;
}

// Get locale from localStorage with fallback
export function getStoredLocale(): SupportedLocale {
  if (typeof window === "undefined") return i18nConfig.defaultLocale;

  try {
    const stored = localStorage.getItem("locale") as SupportedLocale;
    if (stored && i18nConfig.supportedLocales.includes(stored)) {
      return stored;
    }
  } catch (error) {
    console.warn("Error reading locale from localStorage:", error);
  }

  return getBrowserLocale();
}

// Store locale in localStorage
export function setStoredLocale(locale: SupportedLocale): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem("locale", locale);
  } catch (error) {
    console.warn("Error storing locale in localStorage:", error);
  }
}

// Check if locale is supported
export function isValidLocale(locale: string): locale is SupportedLocale {
  return i18nConfig.supportedLocales.includes(locale as SupportedLocale);
}
