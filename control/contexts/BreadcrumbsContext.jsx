'use client';

// Lite doesn't render breadcrumbs. This shim keeps the copied wizard happy.
import { createContext, useContext } from 'react';

const BreadcrumbsContext = createContext({
  setBreadcrumbs: () => {},
  breadcrumbs: [],
});

export function BreadcrumbsProvider({ children }) {
  return (
    <BreadcrumbsContext.Provider value={{ setBreadcrumbs: () => {}, breadcrumbs: [] }}>
      {children}
    </BreadcrumbsContext.Provider>
  );
}

export function useBreadcrumbs() {
  return useContext(BreadcrumbsContext);
}
