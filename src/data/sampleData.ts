import type {
  User,
  Post,
  FriendRequest,
  Conversation,
  NotificationItem,
} from '../types/index.ts';

// Local high-fidelity campus life assets
export const CAMPUS_IMAGES = {
  quad: '/src/assets/images/absu_campus_quad.webp',
  library: '/src/assets/images/absu_library_study.webp',
  sports: '/src/assets/images/absu_sports_pitch.webp',
  matriculation: '/src/assets/images/absu_matriculation_celebration.webp',
};

// Current Demo User (Abia State University student)
export const initialCurrentUser: User = {
  id: 'user_chinedu',
  name: 'Chinedu Okeke',
  handle: '@chinedu_o',
  avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
  department: 'Computer Science',
  faculty: 'Faculty of Physical Sciences',
  level: '300 Level',
  campus: 'Uturu (Main Campus)',
  bio: 'Computer Science 300L | Tech enthusiast, web builder & intramural football defender. Always open to collaborate on projects.',
  interests: ['Software Dev', 'Algorithms', 'Football', 'Campus Tech'],
  mutualFriendsCount: 0,
  isVerified: true,
  relationshipState: 'self',
};

// Other campus personas
export const sampleUsersList: User[] = [
  {
    id: 'user_amaka',
    name: 'Amaka Eze',
    handle: '@amaka_eze',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
    department: 'Medicine & Surgery',
    faculty: 'College of Health Sciences',
    level: '400 Level',
    campus: 'Aba Campus',
    bio: 'Medical student, future pediatrician, research assistant, and coffee lover. Coffee & pathology flashcards keep me going.',
    interests: ['Pediatrics', 'Medical Research', 'Volunteering', 'Literature'],
    mutualFriendsCount: 14,
    isVerified: true,
    relationshipState: 'friends',
  },
  {
    id: 'user_emeka',
    name: 'Emeka Nwosu',
    handle: '@emeka_law',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
    department: 'Law',
    faculty: 'Faculty of Law',
    level: '300 Level',
    campus: 'Uturu (Main Campus)',
    bio: 'Student advocate, moot court enthusiast, and member of the Law Students Association. Let justice be done though the heavens fall.',
    interests: ['Constitutional Law', 'Debating', 'Legal Tech', 'Chess'],
    mutualFriendsCount: 22,
    isVerified: false,
    relationshipState: 'friends',
  },
  {
    id: 'user_kalu',
    name: 'Kalu Ibe',
    handle: '@kalu_architect',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=300&auto=format&fit=crop&q=80',
    department: 'Architecture',
    faculty: 'Faculty of Environmental Studies',
    level: '400 Level',
    campus: 'Uturu (Main Campus)',
    bio: 'Drafting future urban spaces. BIM modeling, sustainable housing, and 3D architectural rendering enthusiast.',
    interests: ['Architecture', 'Urban Design', 'Sketching', 'Photography'],
    mutualFriendsCount: 8,
    isVerified: false,
    relationshipState: 'none',
  },
  {
    id: 'user_ngozi',
    name: 'Ngozi Onyema',
    handle: '@ngozi_nursing',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&auto=format&fit=crop&q=80',
    department: 'Nursing Science',
    faculty: 'College of Health Sciences',
    level: '200 Level',
    campus: 'Aba Campus',
    bio: 'Passionate about patient care and healthcare equity. Member of ABSU Christian Fellowship & Red Cross.',
    interests: ['Healthcare', 'First Aid', 'Choral Music', 'Baking'],
    mutualFriendsCount: 5,
    isVerified: false,
    relationshipState: 'none',
  },
  {
    id: 'user_somto',
    name: 'Somtochukwu Anya',
    handle: '@somto_econ',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=300&auto=format&fit=crop&q=80',
    department: 'Economics',
    faculty: 'Faculty of Social Sciences',
    level: '300 Level',
    campus: 'Uturu (Main Campus)',
    bio: 'Macroeconomics, financial markets, and student politics observer. SUG Parliamentary Council member.',
    interests: ['Public Policy', 'Macroeconomics', 'Investments', 'Campus Journalism'],
    mutualFriendsCount: 19,
    isVerified: false,
    relationshipState: 'request_received',
  },
  {
    id: 'user_favour',
    name: 'Favour Uche',
    handle: '@favour_medlab',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&auto=format&fit=crop&q=80',
    department: 'Medical Laboratory Science',
    faculty: 'College of Health Sciences',
    level: '200 Level',
    campus: 'Aba Campus',
    bio: 'Microbiology and haematology enthusiast. Let us decipher the unseen microorganisms.',
    interests: ['Microbiology', 'Haematology', 'Badminton'],
    mutualFriendsCount: 11,
    isVerified: false,
    relationshipState: 'request_received',
  },
  {
    id: 'user_ifeanyi',
    name: 'Ifeanyi Duru',
    handle: '@ifeanyi_masscomm',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&auto=format&fit=crop&q=80',
    department: 'Mass Communication',
    faculty: 'Faculty of Humanities',
    level: '300 Level',
    campus: 'Uturu (Main Campus)',
    bio: 'Broadcast journalist in training. Host on ABSU campus radio broadcast, podcast producer, and storyteller.',
    interests: ['Broadcasting', 'Documentary', 'Podcasting', 'Creative Writing'],
    mutualFriendsCount: 7,
    isVerified: false,
    relationshipState: 'request_sent',
  },
  {
    id: 'user_kelechi',
    name: 'Kelechi Uka',
    handle: '@kelechi_biochem',
    avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=300&auto=format&fit=crop&q=80',
    department: 'Biochemistry',
    faculty: 'Faculty of Biological Sciences',
    level: '400 Level',
    campus: 'Uturu (Main Campus)',
    bio: 'Final year biochemist. Investigating plant phytochemicals for bioactive compounds. Captain, Science Football team.',
    interests: ['Biotechnology', 'Phytotherapy', 'Campus Football', 'Fitness'],
    mutualFriendsCount: 16,
    isVerified: false,
    relationshipState: 'friends',
  },
  {
    id: 'user_adanna',
    name: 'Adanna Kalu',
    handle: '@adanna_pharm',
    avatar: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=300&auto=format&fit=crop&q=80',
    department: 'Pharmacy',
    faculty: 'College of Health Sciences',
    level: '300 Level',
    campus: 'Aba Campus',
    bio: 'Pharmacology scholar. Curious about drug delivery systems and herbal medicine standardization.',
    interests: ['Pharmacology', 'Organic Chemistry', 'Poetry'],
    mutualFriendsCount: 9,
    isVerified: false,
    relationshipState: 'none',
  },
];

// Initial Posts
export const initialPosts: Post[] = [
  {
    id: 'post_1',
    author: initialCurrentUser,
    content:
      'Productive evening study session at the University Central Library prepping for CSC 304 (Operating Systems) algorithms. Who else has test prep groups running this week? Grab a seat on the second floor!',
    mediaUrl: CAMPUS_IMAGES.library,
    category: 'Academic',
    audience: 'Public',
    createdAt: '2 hrs ago',
    likesCount: 38,
    isLiked: false,
    isSaved: true,
    comments: [
      {
        id: 'c1',
        postId: 'post_1',
        author: {
          id: 'user_emeka',
          name: 'Emeka Nwosu',
          avatar: sampleUsersList[1].avatar,
          department: 'Law',
          level: '300L',
        },
        content: 'Is the second floor AC working today Chinedu? Might join you to read Jurisprudence after 5 PM.',
        createdAt: '1 hr ago',
        likesCount: 4,
      },
      {
        id: 'c2',
        postId: 'post_1',
        author: {
          id: 'user_kelechi',
          name: 'Kelechi Uka',
          avatar: sampleUsersList[7].avatar,
          department: 'Biochemistry',
          level: '400L',
        },
        content: 'Power has been steady all day. Make sure you leave before the 8 PM security bell rings though!',
        createdAt: '30 mins ago',
        likesCount: 2,
      },
    ],
  },
  {
    id: 'post_2',
    author: sampleUsersList[1], // Emeka Nwosu
    content:
      'Clear skies and peaceful breeze across the Faculty walkway after heavy morning lectures. The energy around Uturu campus today is vibrant. Best of luck to everyone writing departmental test papers today!',
    mediaUrl: CAMPUS_IMAGES.quad,
    category: 'General',
    audience: 'Public',
    createdAt: '5 hrs ago',
    likesCount: 74,
    isLiked: true,
    isSaved: false,
    comments: [
      {
        id: 'c3',
        postId: 'post_2',
        author: {
          id: 'user_chinedu',
          name: 'Chinedu Okeke',
          avatar: initialCurrentUser.avatar,
          department: 'Computer Science',
          level: '300L',
        },
        content: 'The new walkways look really good compared to last session. Great snap counselor!',
        createdAt: '4 hrs ago',
        likesCount: 6,
      },
    ],
  },
  {
    id: 'post_3',
    author: sampleUsersList[7], // Kelechi Uka
    content:
      'CAMPUS MATCH UPDATE: Faculty of Biological Sciences vs Faculty of Engineering intramural semi-final clash this Friday at the Uturu Main Sports Arena! Kick-off is 3:30 PM prompt. Come support the green champions!',
    mediaUrl: CAMPUS_IMAGES.sports,
    category: 'Campus Update',
    audience: 'Campus Only',
    createdAt: '8 hrs ago',
    likesCount: 112,
    isLiked: false,
    isSaved: false,
    comments: [
      {
        id: 'c4',
        postId: 'post_3',
        author: {
          id: 'user_ifeanyi',
          name: 'Ifeanyi Duru',
          avatar: sampleUsersList[6].avatar,
          department: 'Mass Communication',
          level: '300L',
        },
        content: 'ABSU Campus Radio will be doing live pitch-side commentary! May the best squad take the trophy.',
        createdAt: '7 hrs ago',
        likesCount: 8,
      },
    ],
  },
  {
    id: 'post_4',
    author: sampleUsersList[0], // Amaka Eze
    content:
      'Throwback to matriculation memories! Still remember taking these photos outside the main gate with so much excitement and anxiety. To all our newly admitted 100-level students in Aba and Uturu campuses, welcome home. Take your coursework seriously from day one, make good friends, and take care of your health.',
    mediaUrl: CAMPUS_IMAGES.matriculation,
    category: 'Hostel Life',
    audience: 'Public',
    createdAt: '1 day ago',
    likesCount: 189,
    isLiked: true,
    isSaved: true,
    comments: [
      {
        id: 'c5',
        postId: 'post_4',
        author: {
          id: 'user_ngozi',
          name: 'Ngozi Onyema',
          avatar: sampleUsersList[3].avatar,
          department: 'Nursing Science',
          level: '200L',
        },
        content: 'Such an inspiring message senior Amaka! We really needed to hear this before anatomy viva.',
        createdAt: '22 hrs ago',
        likesCount: 12,
      },
    ],
  },
  {
    id: 'post_5',
    author: sampleUsersList[4], // Somtochukwu Anya
    content:
      'Notice to all students: The SUG town-hall interactive session regarding hostel water pumping schedule and campus shuttle transport fares is taking place tomorrow Thursday at the Main Amphitheatre by 12:00 noon. Please attend so your faculty representatives hear your concerns.',
    category: 'Campus Update',
    audience: 'Campus Only',
    createdAt: '1 day ago',
    likesCount: 95,
    isLiked: false,
    isSaved: false,
    comments: [],
  },
];

// Initial Friend Requests
export const initialFriendRequests: FriendRequest[] = [
  {
    id: 'req_1',
    user: sampleUsersList[4], // Somtochukwu Anya
    createdAt: '3 hrs ago',
    mutualCount: 19,
    type: 'received',
  },
  {
    id: 'req_2',
    user: sampleUsersList[5], // Favour Uche
    createdAt: '1 day ago',
    mutualCount: 11,
    type: 'received',
  },
  {
    id: 'req_3',
    user: sampleUsersList[6], // Ifeanyi Duru
    createdAt: '2 days ago',
    mutualCount: 7,
    type: 'sent',
  },
];

// Initial Conversations
export const initialConversations: Conversation[] = [
  {
    id: 'conv_amaka',
    participant: sampleUsersList[0], // Amaka Eze
    lastMessage: 'Sure, I will send the pathology review slides once I get back to the clinic.',
    lastMessageTime: '18m ago',
    unreadCount: 1,
    messages: [
      {
        id: 'm1',
        senderId: 'user_amaka',
        text: 'Hey Chinedu! How did the programming practical test go yesterday?',
        timestamp: '11:20 AM',
        isOutgoing: false,
      },
      {
        id: 'm2',
        senderId: 'user_chinedu',
        text: 'Hey Amaka! It went smoothly, finished the dynamic programming problem with 15 minutes to spare.',
        timestamp: '11:25 AM',
        isOutgoing: true,
      },
      {
        id: 'm3',
        senderId: 'user_chinedu',
        text: 'Are you guys in Aba this weekend or visiting the Uturu campus for the sports championship?',
        timestamp: '11:26 AM',
        isOutgoing: true,
      },
      {
        id: 'm4',
        senderId: 'user_amaka',
        text: 'Sure, I will send the pathology review slides once I get back to the clinic.',
        timestamp: '11:42 AM',
        isOutgoing: false,
      },
    ],
  },
  {
    id: 'conv_emeka',
    participant: sampleUsersList[1], // Emeka Nwosu
    lastMessage: 'See you by the Cafeteria round 4 PM!',
    lastMessageTime: '2 hrs ago',
    unreadCount: 0,
    messages: [
      {
        id: 'm5',
        senderId: 'user_emeka',
        text: 'Chinedu, are you around Faculty of Sciences?',
        timestamp: '9:15 AM',
        isOutgoing: false,
      },
      {
        id: 'm6',
        senderId: 'user_chinedu',
        text: 'Yes bro, just coming out of database lecture hall.',
        timestamp: '9:18 AM',
        isOutgoing: true,
      },
      {
        id: 'm7',
        senderId: 'user_emeka',
        text: 'See you by the Cafeteria round 4 PM!',
        timestamp: '9:30 AM',
        isOutgoing: false,
      },
    ],
  },
  {
    id: 'conv_kelechi',
    participant: sampleUsersList[7], // Kelechi Uka
    lastMessage: 'Make sure your football boots are cleaned for Friday practice.',
    lastMessageTime: 'Yesterday',
    unreadCount: 0,
    messages: [
      {
        id: 'm8',
        senderId: 'user_kelechi',
        text: 'Chinedu, coach confirmed you are starting at left wing-back.',
        timestamp: 'Yesterday 6:00 PM',
        isOutgoing: false,
      },
      {
        id: 'm9',
        senderId: 'user_chinedu',
        text: 'Awesome, ready to sprint! We will keep a clean sheet.',
        timestamp: 'Yesterday 6:15 PM',
        isOutgoing: true,
      },
      {
        id: 'm10',
        senderId: 'user_kelechi',
        text: 'Make sure your football boots are cleaned for Friday practice.',
        timestamp: 'Yesterday 6:30 PM',
        isOutgoing: false,
      },
    ],
  },
];

// Initial Notifications
export const initialNotifications: NotificationItem[] = [
  {
    id: 'notif_1',
    type: 'friend_request',
    actor: {
      id: sampleUsersList[4].id,
      name: sampleUsersList[4].name,
      avatar: sampleUsersList[4].avatar,
    },
    content: 'sent you a friend request. Tap to respond.',
    timestamp: '3 hrs ago',
    isRead: false,
    actionUrl: 'friends',
  },
  {
    id: 'notif_2',
    type: 'like',
    actor: {
      id: sampleUsersList[0].id,
      name: sampleUsersList[0].name,
      avatar: sampleUsersList[0].avatar,
    },
    content: 'liked your library study session post.',
    timestamp: '1 hr ago',
    isRead: false,
  },
  {
    id: 'notif_3',
    type: 'comment',
    actor: {
      id: sampleUsersList[1].id,
      name: sampleUsersList[1].name,
      avatar: sampleUsersList[1].avatar,
    },
    content: 'commented: "Is the second floor AC working today Chinedu?"',
    timestamp: '1 hr ago',
    isRead: false,
  },
  {
    id: 'notif_4',
    type: 'message',
    actor: {
      id: sampleUsersList[0].id,
      name: sampleUsersList[0].name,
      avatar: sampleUsersList[0].avatar,
    },
    content: 'sent you a new direct message.',
    timestamp: '18 mins ago',
    isRead: false,
    actionUrl: 'messages',
  },
  {
    id: 'notif_5',
    type: 'campus_notice',
    actor: {
      id: 'absu_official',
      name: 'ABSU Campus Registrar',
      avatar: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=300&auto=format&fit=crop&q=80',
    },
    content: 'Official timetable for second semester 2025/2026 examination released.',
    timestamp: '2 days ago',
    isRead: true,
  },
];

// Marketplace preview items (Version 2 teaser)
export interface MarketplaceTeaserItem {
  id: string;
  title: string;
  category: string;
  price: string;
  sellerDepartment: string;
  location: string;
  condition: string;
  description: string;
}

export const sampleMarketplacePreviews: MarketplaceTeaserItem[] = [
  {
    id: 'item_1',
    title: 'Standard Architectural Drafting Board & T-Square',
    category: 'Course Equipment',
    price: '₦24,000',
    sellerDepartment: 'Architecture, 400L',
    location: 'Uturu Main Hostel B',
    condition: 'Gently used',
    description: 'Perfect for 100L–200L environmental science and engineering students. Comes with clips and scale ruler.',
  },
  {
    id: 'item_2',
    title: 'Rechargeable 12-inch Campus Study Desk Fan with LED',
    category: 'Hostel Essentials',
    price: '₦18,500',
    sellerDepartment: 'Economics, 300L',
    location: 'Off-campus Lodge, Uturu',
    condition: 'Like new',
    description: 'Runs for 8 hours on low setting during power outages. Solar and AC charging compatible.',
  },
  {
    id: 'item_3',
    title: 'Medical Stethoscope & Clinical Pathology Pocket Manual',
    category: 'Medical Books & Tools',
    price: '₦32,000',
    sellerDepartment: 'Medicine & Surgery, 500L',
    location: 'College of Health, Aba',
    condition: 'Excellent',
    description: 'High acoustic sensitivity, stainless steel dual-head chest piece, includes spare earpieces.',
  },
  {
    id: 'item_4',
    title: 'CSC Complete Lecture Transcripts & Past Practical Solutions',
    category: 'Academic Material',
    price: '₦4,500',
    sellerDepartment: 'Computer Science, Alumni',
    location: 'Digital Download / Handover',
    condition: 'Clean binder copy',
    description: 'Covers C++, Java, Database systems, and Data Structures with annotated exam guidelines.',
  },
];
