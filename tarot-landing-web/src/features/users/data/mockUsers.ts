export interface User {
  id: string;
  name: string;
  email: string;
  status: "Active" | "Inactive" | "Suspended";
  tier: "Platinum" | "Gold" | "Silver" | "Bronze";
  avatar: string;
  location: string;
  currency: "USD" | "EUR" | "TND";
  overallSpending: number;
  lastTransaction: string;
  accountCreation: string;
  riskScore: number; // 0-100 scale
}

export const MOCK_USERS: User[] = [
  { 
    id: "ID-9921", 
    name: "Hamza Baloumi", 
    email: "h.baloumi@jesser.dev", 
    status: "Active", 
    tier: "Platinum",
    avatar: "HB",
    location: "Tunis, TN",
    currency: "USD",
    overallSpending: 12450.75,
    lastTransaction: "2026-04-25",
    accountCreation: "2024-01-12",
    riskScore: 12
  },
  { 
    id: "ID-4412", 
    name: "Elena Kostic", 
    email: "elena.k@quantum.io", 
    status: "Active", 
    tier: "Gold",
    avatar: "EK",
    location: "Belgrade, RS",
    currency: "EUR",
    overallSpending: 8920.00,
    lastTransaction: "2026-04-27",
    accountCreation: "2024-11-05",
    riskScore: 5
  },
  { 
    id: "ID-3001", 
    name: "Marcus Wright", 
    email: "m.wright@atlas.co", 
    status: "Suspended", 
    tier: "Bronze",
    avatar: "MW",
    location: "New York, US",
    currency: "USD",
    overallSpending: 120.50,
    lastTransaction: "2025-12-15",
    accountCreation: "2025-06-20",
    riskScore: 88
  },
  { 
    id: "ID-7721", 
    name: "Sarah Chen", 
    email: "schen@void.design", 
    status: "Active", 
    tier: "Platinum",
    avatar: "SC",
    location: "Singapore, SG",
    currency: "USD",
    overallSpending: 45600.20,
    lastTransaction: "Just Now",
    accountCreation: "2023-08-14",
    riskScore: 2
  },
  { 
    id: "ID-1192", 
    name: "Alex Rivera", 
    email: "arivera@stack.dev", 
    status: "Inactive", 
    tier: "Silver",
    avatar: "AR",
    location: "Madrid, ES",
    currency: "EUR",
    overallSpending: 3400.00,
    lastTransaction: "3 days ago",
    accountCreation: "2025-01-30",
    riskScore: 15
  },
  { 
    id: "ID-8843", 
    name: "Jordan Lee", 
    email: "j.lee@nexus.com", 
    status: "Active", 
    tier: "Gold",
    avatar: "JL",
    location: "London, UK",
    currency: "EUR",
    overallSpending: 15200.45,
    lastTransaction: "5 hours ago",
    accountCreation: "2024-03-12",
    riskScore: 8
  },
  { 
    id: "ID-2251", 
    name: "Sofia Rossi", 
    email: "s.rossi@milan.it", 
    status: "Active", 
    tier: "Platinum",
    avatar: "SR",
    location: "Milan, IT",
    currency: "EUR",
    overallSpending: 22100.00,
    lastTransaction: "Yesterday",
    accountCreation: "2023-12-01",
    riskScore: 4
  },
  { 
    id: "ID-6632", 
    name: "Liam O'Connor", 
    email: "liam.oc@dublin.ie", 
    status: "Suspended", 
    tier: "Silver",
    avatar: "LO",
    location: "Dublin, IE",
    currency: "EUR",
    overallSpending: 0.00,
    lastTransaction: "N/A",
    accountCreation: "2026-04-01",
    riskScore: 95
  }
];