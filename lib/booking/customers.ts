export type Customer = {
  id: string;
  email: string;
  name: string;
  phone: string;
  /** Demo-only plain password — replace with Supabase Auth in production. */
  password: string;
};

export const DEMO_CUSTOMERS: Customer[] = [
  {
    id: 'cust-1',
    email: 'customer@demo.com',
    name: 'Ahmad Hassan',
    phone: '+201012345678',
    password: 'demo123',
  },
  {
    id: 'cust-2',
    email: 'sara@demo.com',
    name: 'Sara Mohamed',
    phone: '+201098765432',
    password: 'demo123',
  },
];
