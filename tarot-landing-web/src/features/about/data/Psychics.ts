export interface Psychic {
  id: string;
  name: string;
  image: string;
  rating: number;
  specialties: string[];
  experience: string;
  consultations: string;
  bio: string;
  price: number;
  order?: number;

}

export const PSYCHICS: Psychic[] = [
  {
    id: "1",
    name: "Luna Starweaver",
    image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=500&fit=crop",
    rating: 4.9,
    specialties: ["Tarot", "Astrology"],
    experience: "12 Years",
    consultations: "3.2K+",
    bio: "Guiding souls through cosmic wisdom and ancient card readings for over a decade.",
    price: 3.99
  },
  {
    id: "2",
    name: "Raven Nightshade",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=500&fit=crop",
    rating: 5.0,
    specialties: ["Medium", "Spirit Guide"],
    experience: "8 Years",
    consultations: "1.8K+",
    bio: "Connecting the veil between worlds to bring messages from beyond.",
    price: 4.99
  },
  {
    id: "3",
    name: "Celeste Moon",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=500&fit=crop",
    rating: 4.8,
    specialties: ["Reiki", "Energy Healing"],
    experience: "15 Years",
    consultations: "5.1K+",
    bio: "Master healer channeling universal energy to restore balance and harmony.",
    price: 2.99
  },
  {
    id: "4",
    name: "Phoenix Rising",
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=500&fit=crop",
    rating: 4.7,
    specialties: ["Numerology", "Life Path"],
    experience: "10 Years",
    consultations: "2.4K+",
    bio: "Unlocking the secrets hidden within numbers to reveal your destiny.",
    price: 3.49
  },
  {
    id: "5",
    name: "Orion Sage",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=500&fit=crop",
    rating: 4.9,
    specialties: ["Astrology", "Birth Charts"],
    experience: "20 Years",
    consultations: "7.8K+",
    bio: "Celestial navigator mapping your cosmic blueprint through planetary alignments.",
    price: 5.99
  },
  {
    id: "6",
    name: "Mystique Aurora",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=500&fit=crop",
    rating: 4.8,
    specialties: ["Tarot", "Oracle Cards"],
    experience: "9 Years",
    consultations: "2.9K+",
    bio: "Reading the cards to illuminate paths and reveal hidden truths.",
    price: 3.99
  },
  {
    id: "7",
    name: "Shadow Walker",
    image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=500&fit=crop",
    rating: 5.0,
    specialties: ["Past Life", "Regression"],
    experience: "14 Years",
    consultations: "4.2K+",
    bio: "Journey guide through past incarnations to heal present wounds.",
    price: 6.99
  },
  {
    id: "8",
    name: "Crystal Waters",
    image: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=400&h=500&fit=crop",
    rating: 4.9,
    specialties: ["Crystal Healing", "Chakra"],
    experience: "11 Years",
    consultations: "3.6K+",
    bio: "Harmonizing energy centers through crystal vibrations and ancient wisdom.",
    price: 3.49
  }
];
