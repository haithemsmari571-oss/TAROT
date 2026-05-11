import { COLORS } from "../../../theme";

export interface Availability {
  day_of_the_week: string;
  start_at: string;
  end_at: string;
}

export interface Practitioner {
  // Original Fields
  id: string;
  name: string;
  email: string;
  specialty: "Astrology" | "Tarot" | "Reiki" | "Medium" | "Numerology";
  rating: number;
  isOnline: boolean;
  avatar: string;
  location: string;
  sessionsCompleted: number;
  joinedDate: string;

  // New Backend-Aligned Fields
  username: string; // From backend schema
  price_per_second: number; // For financial calc
  bio: string;
  categories_ids: number[];
  availability: Availability[];
  
  // Dashboard Analytics
  overallIncome: number;
  linkedUsers: {
    id: string;
    name: string;
    lastSession: string;
    avatar?: string;
  }[];
}

export const MOCK_PRACTITIONERS: Practitioner[] = [
  {
    id: "P-882",
    name: "Elena Vance",
    username: "elena_v",
    email: "elena.v@nexus.aura",
    specialty: "Astrology",
    rating: 4.9,
    isOnline: true,
    location: "Casablanca, MA",
    sessionsCompleted: 1240,
    joinedDate: "Autumn Equinox 2024",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop",
    price_per_second: 0.05,
    bio: "Celestial guide specializing in birth chart alignment and planetary transits.",
    categories_ids: [1, 4],
    overallIncome: 12450.50,
    availability: [
      { day_of_the_week: "Monday", start_at: "09:00:00Z", end_at: "17:00:00Z" },
      { day_of_the_week: "Wednesday", start_at: "09:00:00Z", end_at: "17:00:00Z" }
    ],
    linkedUsers: [
      { id: "U-102", name: "Sarah J.", lastSession: "2 days ago" },
      { id: "U-504", name: "Mike R.", lastSession: "1 week ago" }
    ]
  },
  {
    id: "P-415",
    name: "Julian Thorne",
    username: "j_thorne",
    email: "thorne.j@nexus.aura",
    specialty: "Tarot",
    rating: 5.0,
    isOnline: false,
    location: "London, UK",
    sessionsCompleted: 892,
    joinedDate: "Full Moon 2025",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop",
    price_per_second: 0.08,
    bio: "Master of the Major Arcana. Providing clarity through ancient symbolism.",
    categories_ids: [2],
    overallIncome: 8200.00,
    availability: [
      { day_of_the_week: "Friday", start_at: "18:00:00Z", end_at: "23:00:00Z" }
    ],
    linkedUsers: [
      { id: "U-99", name: "Emma L.", lastSession: "Just now" }
    ]
  },
  {
    id: "P-901",
    name: "Sienna Al-Farsi",
    username: "sienna_healing",
    email: "sienna.a@nexus.aura",
    specialty: "Reiki",
    rating: 4.8,
    isOnline: true,
    location: "Sousse, TN",
    sessionsCompleted: 215,
    joinedDate: "Spring 2026",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&auto=format&fit=crop",
    price_per_second: 0.04,
    bio: "Energy healing and distance Reiki master. Focus on chakra balancing.",
    categories_ids: [3, 5],
    overallIncome: 3105.75,
    availability: [
      { day_of_the_week: "Tuesday", start_at: "10:00:00Z", end_at: "14:00:00Z" }
    ],
    linkedUsers: []
  },
  {
    id: "P-332",
    name: "Marcus Void",
    username: "m_void",
    email: "void.m@nexus.aura",
    specialty: "Medium",
    rating: 4.7,
    isOnline: false,
    location: "Berlin, DE",
    sessionsCompleted: 3410,
    joinedDate: "Winter Solstice 2023",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop",
    price_per_second: 0.12,
    bio: "Bridge between worlds. Helping you connect with those who have passed.",
    categories_ids: [1, 2, 3],
    overallIncome: 45200.00,
    availability: [
      { day_of_the_week: "Thursday", start_at: "20:00:00Z", end_at: "02:00:00Z" }
    ],
    linkedUsers: [
      { id: "U-202", name: "Anna K.", lastSession: "3 weeks ago" },
      { id: "U-11", name: "David O.", lastSession: "1 month ago" }
    ]
  },
  {
    id: "P-119",
    name: "Aria Celeste",
    username: "aria_numbers",
    email: "celeste.a@nexus.aura",
    specialty: "Numerology",
    rating: 5.0,
    isOnline: true,
    location: "Paris, FR",
    sessionsCompleted: 560,
    joinedDate: "Summer 2025",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop",
    price_per_second: 0.06,
    bio: "Decoding the mathematical blueprint of your soul's purpose.",
    categories_ids: [4],
    overallIncome: 5400.20,
    availability: [
      { day_of_the_week: "Saturday", start_at: "12:00:00Z", end_at: "18:00:00Z" }
    ],
    linkedUsers: [
      { id: "U-88", name: "Chloe M.", lastSession: "4 days ago" }
    ]
  }
];

export const getSpecialtyColor = (specialty: string) => {
  switch (specialty) {
    case "Astrology": return COLORS.primary;
    case "Tarot": return COLORS.primaryDark; 
    case "Reiki": return "#4ADE80"; 
    case "Medium": return COLORS.starGold;
    default: return COLORS.neutralGray;
  }
};