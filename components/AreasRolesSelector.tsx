"use client";

import { useState, useEffect } from "react";
import { UserRoles } from "@/lib/areas-roles";

interface AreasRolesSelectorProps {
  selectedAreas: string[];
  selectedRoles: UserRoles;
  onChange: (areas: string[], roles: UserRoles) => void;
  disabled?: boolean;
}

interface Area {
  id: string;
  name: string;
  code?: string;
}

interface Duty {
  id: string;
  name: string;
  area: string;
  code?: string; // optional code used for ordering
}

export default function AreasRolesSelector({
  selectedAreas,
  selectedRoles,
  onChange,
  disabled = false,
}: AreasRolesSelectorProps) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [areasRes, dutiesRes] = await Promise.all([
        fetch("/api/areas"),
        fetch("/api/duties"),
      ]);

      if (areasRes.ok) {
        const areasData = await areasRes.json();
        const sortedAreas = [...areasData].sort((a: Area, b: Area) => {
          const aNum = parseInt((a.code || "").replace(/\D/g, ""), 10);
          const bNum = parseInt((b.code || "").replace(/\D/g, ""), 10);
          if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) {
            return aNum - bNum;
          }
          if (!isNaN(aNum) && isNaN(bNum)) return -1;
          if (isNaN(aNum) && !isNaN(bNum)) return 1;
          return (a.name || "").localeCompare(b.name || "");
        });
        setAreas(sortedAreas);
      }

      if (dutiesRes.ok) {
        const dutiesData = await dutiesRes.json();
        setDuties(dutiesData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getRolesByArea = (area: string) => {
    // Sort by numeric code if available (e.g., 001, 002), but render only the name
    return duties
      .filter((duty) => duty.area === area)
      .sort((a, b) => {
        const aNum = parseInt((a.code || '').replace(/\D/g, ''), 10);
        const bNum = parseInt((b.code || '').replace(/\D/g, ''), 10);
        if (isNaN(aNum) && isNaN(bNum)) return a.name.localeCompare(b.name);
        if (isNaN(aNum)) return 1;
        if (isNaN(bNum)) return -1;
        return aNum - bNum;
      })
      .map((duty) => duty.name);
  };

  const sortAreasList = (list: string[]) => {
    if (!areas.length) {
      return [...list].sort((a, b) => a.localeCompare(b));
    }
    const orderMap = new Map<string, number>(areas.map((area, index) => [area.name, index]));
    return [...list].sort((a, b) => {
      const orderDiff = (orderMap.get(a) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b) ?? Number.MAX_SAFE_INTEGER);
      if (orderDiff !== 0) return orderDiff;
      return a.localeCompare(b);
    });
  };

  const handleAreaChange = (area: string, checked: boolean) => {
    let newAreas = [...selectedAreas];
    let newRoles = { ...selectedRoles };

    if (checked) {
      // Aggiungi l'area se non è già presente
      if (!newAreas.includes(area)) {
        newAreas.push(area);
        // Inizializza i ruoli per questa area
        newRoles[area] = [];
      }
    } else {
      // Rimuovi l'area e i suoi ruoli
      newAreas = newAreas.filter((a) => a !== area);
      delete newRoles[area];
    }

    onChange(sortAreasList(newAreas), newRoles);
  };

  const handleRoleChange = (area: string, role: string, checked: boolean) => {
    const newRoles = { ...selectedRoles };
    
    if (!newRoles[area]) {
      newRoles[area] = [];
    }

    if (checked) {
      // Aggiungi il ruolo
      if (!newRoles[area].includes(role)) {
        newRoles[area] = [...newRoles[area], role];
      }
    } else {
      // Rimuovi il ruolo
      newRoles[area] = newRoles[area].filter((r) => r !== role);
    }

    onChange(sortAreasList(selectedAreas), newRoles);
  };

  const orderedSelectedAreas = sortAreasList(selectedAreas);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Aree di Appartenenza *
        </label>
        <div className="space-y-2">
          {areas.map((area) => (
            <label key={area.id} className="flex items-center">
              <input
                type="checkbox"
                checked={selectedAreas.includes(area.name)}
                onChange={(e) => handleAreaChange(area.name, e.target.checked)}
                className="mr-2 w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
                disabled={disabled}
              />
              <span className="text-sm text-gray-700">{area.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Mostra i ruoli solo per le aree selezionate */}
      {orderedSelectedAreas.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ruoli per Area
          </label>
          {orderedSelectedAreas.map((area) => {
            const roles = getRolesByArea(area);

            // Mostra i ruoli anche per Area Amministrativa

            if (roles.length === 0) {
              return null;
            }

            return (
              <div key={area} className="mb-4 p-3 border border-gray-200 rounded-lg">
                <h4 className="font-medium text-gray-700 mb-2">{area}</h4>
                <div className="space-y-2">
                  {roles.map((role) => (
                    <label key={role} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedRoles[area]?.includes(role) || false}
                        onChange={(e) => handleRoleChange(area, role, e.target.checked)}
                        className="mr-2 w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
                        disabled={disabled}
                      />
                      <span className="text-sm text-gray-700">{role}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

