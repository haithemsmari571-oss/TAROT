export interface LandingContentSection {
  id: number;
  section: string;
  content: HeroContent | ServiceContent | PackageContent | TestimonialContent | FooterContent | AboutContent | PsychicsContent;
}

export interface SocialLink {
  platform: string;
  url: string;
  icon: string;
}

export interface NavLink {
  name: string;
  path: string;
}

export interface FooterContent {
  brandName: string;
  description: string;
  socialLinks: SocialLink[];
  copyright: string;
  navLinks: NavLink[];
}

export interface AboutContent {
  badge: string;
  title: string;
  titleHighlighted: string;
  established: string;
  tagline: string;
  leftTag: string;
  rightTag: string;
  bodyTitle: string;
  bodyContent: string;
  missionTitle: string;
  missionContent: string;
}

export interface PsychicsContent {
  heading: string;
  headingHighlighted: string;
  subtitle: string;
  subtitleLine2: string;
  featuredPsychicIds: number[];
}

export interface HeroContent {
  badge: string;
  name: string;
  headline: string;
  headlineHighlighted: string;
  subtitle: string;
  primaryCta: string;
  secondaryCta: string;
}

export interface ServiceCard {
  icon: string;
  title: string;
  desc: string;
  energy: string;
}

export interface StatItem {
  label: string;
  value: string;
}

export interface ServiceContent {
  badge: string;
  heading: string;
  headingHighlighted: string;
  cards: ServiceCard[];
  cta: string;
  stats: StatItem[];
}

export interface PackageItem {
  title: string;
  price: string;
  points: number;
  tagline: string;
  features: string[];
  footer: string;
  cta: string;
  popular: boolean;
  label: string;
}

export interface PackageContent {
  badge: string;
  heading: string;
  headingHighlighted: string;
  subheading: string;
  packages: PackageItem[];
}

export interface TestimonialItem {
  name: string;
  role: string;
  content: string;
}

export interface TestimonialContent {
  testimonials: TestimonialItem[];
}
