/**
 * Reference maintenance intervals for models commonly sold in Egypt.
 * Values are conservative “typical service” estimates for planning and reminders.
 * Always follow the printed owner manual for your exact VIN, engine, and driving conditions.
 */

export type CatalogServiceDef = {
  serviceKey: string;
  label: string;
  intervalKm: number | null;
  intervalMonths: number | null;
  notes?: string;
};

export type CatalogCarDef = {
  brand: string;
  model: string;
  variant?: string;
  notes?: string;
  services: CatalogServiceDef[];
};

const oilSevere = (km: number, months: number, extra?: string): CatalogServiceDef => ({
  serviceKey: 'oil_engine',
  label: 'Engine oil & filter',
  intervalKm: km,
  intervalMonths: months,
  notes:
    extra ??
    'Hot climate and dust shorten oil life; many Egyptian owners use 5,000 km for mineral blends.',
});

const atf = (km: number, note?: string): CatalogServiceDef => ({
  serviceKey: 'trans_atf',
  label: 'Automatic transmission fluid (ATF) service',
  intervalKm: km,
  intervalMonths: null,
  notes:
    note ??
    'PRND operation and smooth shifting depend on healthy fluid. Manual calls this “automatic only.”',
});

const mtf = (km: number): CatalogServiceDef => ({
  serviceKey: 'trans_manual',
  label: 'Manual transmission / gear oil',
  intervalKm: km,
  intervalMonths: null,
  notes: 'Ignore this row if your car is automatic.',
});

const brakeFluid: CatalogServiceDef = {
  serviceKey: 'brake_fluid',
  label: 'Brake fluid change / flush',
  intervalKm: 40000,
  intervalMonths: 24,
  notes: 'Time-based in hot humid climates matters as much as km.',
};

const coolant = (km: number, months: number): CatalogServiceDef => ({
  serviceKey: 'coolant',
  label: 'Engine coolant',
  intervalKm: km,
  intervalMonths: months,
});

const airFilter: CatalogServiceDef = {
  serviceKey: 'air_filter',
  label: 'Engine air filter',
  intervalKm: 15000,
  intervalMonths: 12,
};

const cabinFilter: CatalogServiceDef = {
  serviceKey: 'cabin_filter',
  label: 'Cabin (A/C) filter',
  intervalKm: 15000,
  intervalMonths: 12,
};

const spark = (km: number): CatalogServiceDef => ({
  serviceKey: 'spark_plugs',
  label: 'Spark plugs',
  intervalKm: km,
  intervalMonths: null,
});

const tires: CatalogServiceDef = {
  serviceKey: 'tires_rotate',
  label: 'Tire rotation & alignment check',
  intervalKm: 10000,
  intervalMonths: 6,
};

const timingBelt = (km: number): CatalogServiceDef => ({
  serviceKey: 'timing_belt',
  label: 'Timing belt kit (belt + tensioners + water pump where applicable)',
  intervalKm: km,
  intervalMonths: 72,
  notes: 'Only for belt-driven engines; many new cars use chains instead.',
});

const standardTurboIce = (): CatalogServiceDef[] => [
  oilSevere(7500, 6),
  atf(60000),
  mtf(80000),
  brakeFluid,
  coolant(60000, 48),
  airFilter,
  cabinFilter,
  spark(50000),
  tires,
];

const standardNACe = (): CatalogServiceDef[] => [
  oilSevere(8000, 6),
  atf(60000),
  mtf(80000),
  brakeFluid,
  coolant(80000, 60),
  airFilter,
  cabinFilter,
  spark(60000),
  tires,
];

const dieselOil = (): CatalogServiceDef[] => [
  oilSevere(10000, 6, 'Diesel soot loading: check oil level often; interval per manual.'),
  atf(60000),
  mtf(80000),
  brakeFluid,
  coolant(80000, 60),
  airFilter,
  cabinFilter,
  tires,
];

const evPack = (): CatalogServiceDef[] => [
  cabinFilter,
  brakeFluid,
  {
    serviceKey: 'coolant_ev',
    label: 'Battery & inverter coolant (EV)',
    intervalKm: 80000,
    intervalMonths: 48,
    notes: 'Follow the manufacturer EV service schedule; dealer-level work for high voltage.',
  },
  tires,
  {
    serviceKey: 'hv_check',
    label: 'HV safety & software checks (EV)',
    intervalKm: 20000,
    intervalMonths: 12,
    notes: 'Inspection items as per EV service bulletin; not a DIY checklist.',
  },
];

export const EGYPT_CATALOG: CatalogCarDef[] = [
  // Toyota
  {
    brand: 'Toyota',
    model: 'Corolla',
    variant: '1.6 / 1.8 / Hybrid',
    notes: 'Among the most common sedans in Egypt.',
    services: standardNACe(),
  },
  {
    brand: 'Toyota',
    model: 'Camry',
    variant: '2.5 / Hybrid',
    services: standardNACe(),
  },
  {
    brand: 'Toyota',
    model: 'Yaris',
    variant: 'Hatch / Sedan',
    services: standardNACe(),
  },
  {
    brand: 'Toyota',
    model: 'Rush',
    services: standardNACe(),
  },
  {
    brand: 'Toyota',
    model: 'Fortuner',
    variant: '2.7 / 2.8 Diesel',
    notes: 'Diesel variants: follow diesel oil and filter intervals.',
    services: dieselOil(),
  },
  {
    brand: 'Toyota',
    model: 'Hilux',
    variant: 'Diesel pickup',
    services: dieselOil(),
  },

  // Hyundai
  {
    brand: 'Hyundai',
    model: 'Elantra',
    variant: 'CN7',
    services: standardTurboIce(),
  },
  {
    brand: 'Hyundai',
    model: 'Accent / Verna',
    services: standardNACe(),
  },
  {
    brand: 'Hyundai',
    model: 'Tucson',
    services: standardTurboIce(),
  },
  {
    brand: 'Hyundai',
    model: 'Creta',
    services: standardTurboIce(),
  },
  {
    brand: 'Hyundai',
    model: 'Santa Fe',
    services: standardTurboIce(),
  },
  {
    brand: 'Hyundai',
    model: 'Sonata',
    services: standardTurboIce(),
  },

  // Kia
  {
    brand: 'Kia',
    model: 'Cerato / K3',
    services: standardTurboIce(),
  },
  {
    brand: 'Kia',
    model: 'Sportage',
    services: standardTurboIce(),
  },
  {
    brand: 'Kia',
    model: 'Sorento',
    services: standardTurboIce(),
  },
  {
    brand: 'Kia',
    model: 'Pegas',
    services: standardNACe(),
  },
  {
    brand: 'Kia',
    model: 'Rio',
    services: standardNACe(),
  },

  // Nissan
  {
    brand: 'Nissan',
    model: 'Sunny',
    services: standardNACe(),
  },
  {
    brand: 'Nissan',
    model: 'Sentra',
    services: standardTurboIce(),
  },
  {
    brand: 'Nissan',
    model: 'Qashqai',
    services: standardTurboIce(),
  },
  {
    brand: 'Nissan',
    model: 'X-Trail',
    services: standardTurboIce(),
  },
  {
    brand: 'Nissan',
    model: 'Patrol',
    variant: 'V6 / V8',
    notes: 'Heavy 4x4: shorter oil life if towing or sand driving.',
    services: [
      oilSevere(5000, 4, 'Severe duty: frequent off-road/sand.'),
      atf(40000, 'Heavy automatic: many owners service more often.'),
      brakeFluid,
      coolant(60000, 48),
      airFilter,
      cabinFilter,
      spark(40000),
      tires,
    ],
  },

  // Renault
  {
    brand: 'Renault',
    model: 'Logan',
    services: [...standardNACe(), timingBelt(90000)],
  },
  {
    brand: 'Renault',
    model: 'Sandero / Stepway',
    services: standardNACe(),
  },
  {
    brand: 'Renault',
    model: 'Duster',
    services: standardTurboIce(),
  },
  {
    brand: 'Renault',
    model: 'Megane',
    services: standardTurboIce(),
  },

  // Peugeot
  {
    brand: 'Peugeot',
    model: '301',
    services: standardTurboIce(),
  },
  {
    brand: 'Peugeot',
    model: '308',
    services: standardTurboIce(),
  },
  {
    brand: 'Peugeot',
    model: '2008',
    services: standardTurboIce(),
  },
  {
    brand: 'Peugeot',
    model: '3008',
    services: standardTurboIce(),
  },

  // Fiat
  {
    brand: 'Fiat',
    model: 'Tipo',
    services: standardTurboIce(),
  },
  {
    brand: 'Fiat',
    model: '500X',
    services: standardTurboIce(),
  },

  // VW / Skoda
  {
    brand: 'Volkswagen',
    model: 'Polo',
    services: standardTurboIce(),
  },
  {
    brand: 'Volkswagen',
    model: 'Golf',
    services: standardTurboIce(),
  },
  {
    brand: 'Volkswagen',
    model: 'T-Roc',
    services: standardTurboIce(),
  },
  {
    brand: 'Skoda',
    model: 'Octavia',
    services: standardTurboIce(),
  },

  // Mitsubishi
  {
    brand: 'Mitsubishi',
    model: 'Lancer',
    services: standardNACe(),
  },
  {
    brand: 'Mitsubishi',
    model: 'ASX',
    services: standardTurboIce(),
  },
  {
    brand: 'Mitsubishi',
    model: 'Eclipse Cross',
    services: standardTurboIce(),
  },
  {
    brand: 'Mitsubishi',
    model: 'Pajero / Montero Sport',
    services: dieselOil(),
  },

  // Honda (smaller footprint, still seen)
  {
    brand: 'Honda',
    model: 'Civic',
    services: standardTurboIce(),
  },
  {
    brand: 'Honda',
    model: 'CR-V',
    services: standardTurboIce(),
  },

  // MG (very common CBU/CKD in Egypt)
  {
    brand: 'MG',
    model: 'ZS',
    services: standardTurboIce(),
  },
  {
    brand: 'MG',
    model: 'HS',
    services: standardTurboIce(),
  },
  {
    brand: 'MG',
    model: 'RX5',
    services: standardTurboIce(),
  },
  {
    brand: 'MG',
    model: '5 / GT',
    services: standardTurboIce(),
  },

  // Chery
  {
    brand: 'Chery',
    model: 'Tiggo 4',
    services: standardTurboIce(),
  },
  {
    brand: 'Chery',
    model: 'Tiggo 7',
    services: standardTurboIce(),
  },
  {
    brand: 'Chery',
    model: 'Tiggo 8',
    services: standardTurboIce(),
  },

  // BYD EV
  {
    brand: 'BYD',
    model: 'Atto 3',
    notes: 'Battery electric: no engine oil.',
    services: evPack(),
  },
  {
    brand: 'BYD',
    model: 'Dolphin',
    notes: 'Battery electric: no engine oil.',
    services: evPack(),
  },

  // Chevrolet (select popular fleet/family cars)
  {
    brand: 'Chevrolet',
    model: 'Optra',
    services: standardNACe(),
  },
  {
    brand: 'Chevrolet',
    model: 'N300 / N400',
    notes: 'Light commercial — check load duty factors.',
    services: [
      oilSevere(5000, 4, 'Commercial use: shorter oil life.'),
      atf(60000),
      mtf(60000),
      brakeFluid,
      coolant(60000, 48),
      airFilter,
      cabinFilter,
      tires,
    ],
  },

  // Jeep (imports)
  {
    brand: 'Jeep',
    model: 'Renegade',
    services: standardTurboIce(),
  },
  {
    brand: 'Jeep',
    model: 'Compass',
    services: standardTurboIce(),
  },

  // Mazda
  {
    brand: 'Mazda',
    model: '3',
    services: standardTurboIce(),
  },
  {
    brand: 'Mazda',
    model: 'CX-5',
    services: standardTurboIce(),
  },

  // Subaru (niche imports)
  {
    brand: 'Subaru',
    model: 'XV / Crosstrek',
    services: standardTurboIce(),
  },

  // Suzuki
  {
    brand: 'Suzuki',
    model: 'Swift',
    services: standardNACe(),
  },
  {
    brand: 'Suzuki',
    model: 'Vitara',
    services: standardTurboIce(),
  },

  // Mercedes-Benz (imports / NTG — verify turbo diesel vs petrol in your manual)
  {
    brand: 'Mercedes-Benz',
    model: 'A-Class',
    variant: 'W177',
    services: standardTurboIce(),
  },
  {
    brand: 'Mercedes-Benz',
    model: 'CLA',
    variant: 'C118',
    services: standardTurboIce(),
  },
  {
    brand: 'Mercedes-Benz',
    model: 'C-Class',
    variant: 'W205 / W206',
    services: standardTurboIce(),
  },
  {
    brand: 'Mercedes-Benz',
    model: 'E-Class',
    variant: 'W213',
    services: standardTurboIce(),
  },
  {
    brand: 'Mercedes-Benz',
    model: 'GLA',
    services: standardTurboIce(),
  },
  {
    brand: 'Mercedes-Benz',
    model: 'GLC',
    variant: 'Incl. 220 d where equipped',
    services: dieselOil(),
  },
  {
    brand: 'Mercedes-Benz',
    model: 'GLE',
    services: standardTurboIce(),
  },
  {
    brand: 'Mercedes-Benz',
    model: 'GLS',
    services: standardTurboIce(),
  },
  {
    brand: 'Mercedes-Benz',
    model: 'Sprinter',
    variant: 'Van / chassis diesel',
    services: dieselOil(),
  },

  // BMW (sedans / SAVs common as CBU imports)
  {
    brand: 'BMW',
    model: '1 Series',
    variant: 'F40 hatch',
    services: standardTurboIce(),
  },
  {
    brand: 'BMW',
    model: '2 Series',
    variant: 'Gran Coupé F44',
    services: standardTurboIce(),
  },
  {
    brand: 'BMW',
    model: '3 Series',
    variant: 'G20',
    services: standardTurboIce(),
  },
  {
    brand: 'BMW',
    model: '5 Series',
    variant: 'G30',
    services: standardTurboIce(),
  },
  {
    brand: 'BMW',
    model: 'X1',
    variant: 'U11',
    services: standardTurboIce(),
  },
  {
    brand: 'BMW',
    model: 'X2',
    services: standardTurboIce(),
  },
  {
    brand: 'BMW',
    model: 'X3',
    variant: 'G01',
    services: standardTurboIce(),
  },
  {
    brand: 'BMW',
    model: 'X4',
    services: standardTurboIce(),
  },
  {
    brand: 'BMW',
    model: 'X5',
    variant: 'G05',
    services: standardTurboIce(),
  },
  {
    brand: 'BMW',
    model: 'X6',
    services: standardTurboIce(),
  },

  // SEAT (VW-group — less volume than Toyota/Hyundai but present as imports / fleet)
  {
    brand: 'Seat',
    model: 'Ibiza',
    services: standardTurboIce(),
  },
  {
    brand: 'Seat',
    model: 'Leon',
    services: standardTurboIce(),
  },
  {
    brand: 'Seat',
    model: 'Arona',
    services: standardTurboIce(),
  },
  {
    brand: 'Seat',
    model: 'Ateca',
    services: standardTurboIce(),
  },
  {
    brand: 'Seat',
    model: 'Tarraco',
    services: standardTurboIce(),
  },

  // Other frequent Egyptian-market additions (European / fleet / imports)
  {
    brand: 'Audi',
    model: 'A3',
    services: standardTurboIce(),
  },
  {
    brand: 'Audi',
    model: 'A4',
    services: standardTurboIce(),
  },
  {
    brand: 'Audi',
    model: 'Q3',
    services: standardTurboIce(),
  },
  {
    brand: 'Audi',
    model: 'Q5',
    services: standardTurboIce(),
  },
  {
    brand: 'MINI',
    model: 'Cooper',
    variant: 'F56',
    services: standardTurboIce(),
  },
  {
    brand: 'MINI',
    model: 'Countryman',
    services: standardTurboIce(),
  },
  {
    brand: 'Opel',
    model: 'Corsa',
    services: standardTurboIce(),
  },
  {
    brand: 'Opel',
    model: 'Astra',
    services: standardTurboIce(),
  },
  {
    brand: 'Opel',
    model: 'Crossland',
    services: standardTurboIce(),
  },
  {
    brand: 'Opel',
    model: 'Grandland',
    services: standardTurboIce(),
  },
  {
    brand: 'Citroën',
    model: 'C3',
    services: standardTurboIce(),
  },
  {
    brand: 'Citroën',
    model: 'C-Elysée',
    services: standardNACe(),
  },
  {
    brand: 'Citroën',
    model: 'C4',
    services: standardTurboIce(),
  },
  {
    brand: 'Citroën',
    model: 'C5 Aircross',
    services: standardTurboIce(),
  },
  {
    brand: 'Ford',
    model: 'Focus',
    services: standardTurboIce(),
  },
  {
    brand: 'Ford',
    model: 'EcoSport',
    services: standardTurboIce(),
  },
  {
    brand: 'Ford',
    model: 'Territory',
    variant: 'Chinese-market crossover sold locally — verify AT fluid cycle.',
    services: standardTurboIce(),
  },
  {
    brand: 'Ford',
    model: 'Ranger',
    variant: 'Pickup diesel popular — shorter intervals when towing.',
    services: dieselOil(),
  },
  {
    brand: 'Land Rover',
    model: 'Range Rover Evoque',
    services: standardTurboIce(),
  },
  {
    brand: 'Land Rover',
    model: 'Discovery Sport',
    services: standardTurboIce(),
  },

  // DFSK / Glory (budget MPVs/SUVs sometimes registered)
  {
    brand: 'DFSK',
    model: 'Glory 580',
    notes: 'Intervals vary by importer bulletin — verify locally.',
    services: standardTurboIce(),
  },
];
