import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEMO_CUSTOMERS, type Customer } from '@/lib/booking/customers';
import { normalizePhoneE164 } from '@/lib/phone';

const CUSTOMERS_KEY = '@pitstop/customers-db/v1';

function newId(): string {
  return `cust-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function readAll(): Promise<Customer[]> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOMERS_KEY);
    if (!raw) return [...DEMO_CUSTOMERS];
    const parsed = JSON.parse(raw) as Customer[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEMO_CUSTOMERS];
    return parsed;
  } catch {
    return [...DEMO_CUSTOMERS];
  }
}

async function writeAll(customers: Customer[]): Promise<void> {
  await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
}

export async function findCustomerByEmail(email: string): Promise<Customer | undefined> {
  const normalized = email.trim().toLowerCase();
  const rows = await readAll();
  return rows.find((c) => c.email.toLowerCase() === normalized);
}

export async function findCustomerById(id: string): Promise<Customer | undefined> {
  const rows = await readAll();
  return rows.find((c) => c.id === id);
}

export async function authenticateCustomer(
  email: string,
  password: string,
): Promise<Customer | null> {
  const customer = await findCustomerByEmail(email);
  if (!customer) return null;
  if (customer.password !== password.trim()) return null;
  return customer;
}

export async function registerCustomer(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<{ customer?: Customer; error?: 'email_taken' | 'invalid' }> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const normalizedPhone = normalizePhoneE164(input.phone);
  const password = input.password.trim();

  if (!name || !email.includes('@') || !normalizedPhone || password.length < 6) {
    return { error: 'invalid' };
  }

  const rows = await readAll();
  if (rows.some((c) => c.email.toLowerCase() === email)) {
    return { error: 'email_taken' };
  }

  const customer: Customer = {
    id: newId(),
    email,
    name,
    phone: normalizedPhone,
    password,
  };
  rows.push(customer);
  await writeAll(rows);
  return { customer };
}

export async function listCustomers(): Promise<Customer[]> {
  return readAll();
}
