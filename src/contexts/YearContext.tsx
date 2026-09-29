import React, { createContext, useContext, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from './AuthContext';

export type AcademicYearStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

export interface AcademicYear {
  id: string;
  school_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: AcademicYearStatus;
  is_current: boolean;
}

interface YearContextType {
  years: AcademicYear[];
  selectedYear: AcademicYear | null;
  setSelectedYear: (year: AcademicYear) => void;
  refreshYears: () => Promise<void>;
  isLoading: boolean;
}

const YearContext = createContext<YearContextType | undefined>(undefined);

export const YearProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYear] = useState<AcademicYear | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { session, schoolId } = useAuth();

  const refreshYears = async () => {
    if (!session?.user?.id || !schoolId) return;

    setIsLoading(true);
    try {
      const data: AcademicYear[] = await invoke('get_academic_years', { schoolId });
      setYears(data);
      
      // Si aucune année n'est sélectionnée (ou si l'année sélectionnée a été supprimée),
      // on sélectionne l'année ACTIVE (is_current = true) en priorité
      setSelectedYear(prev => {
        if (prev && data.some(y => y.id === prev.id)) return prev;
        return data.find(y => y.is_current) || data[0] || null;
      });
    } catch (error) {
      console.error('Erreur lors du chargement des années académiques:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshYears();
  }, [session, schoolId]);

  return (
    <YearContext.Provider value={{ years, selectedYear, setSelectedYear, refreshYears, isLoading }}>
      {children}
    </YearContext.Provider>
  );
};

export const useYear = () => {
  const context = useContext(YearContext);
  if (context === undefined) {
    throw new Error('useYear must be used within a YearProvider');
  }
  return context;
};
