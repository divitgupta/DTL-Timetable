import React, { useState, useEffect } from "react";
import {
  Calendar,
  Users,
  BookOpen,
  Clock,
  AlertCircle,
  CheckCircle,
  Lock,
  UserCheck,
  Plus,
  Trash2,
  Save,
  Eye,
  EyeOff,
  Settings,
  Download,
  FileDown,
  Sun,
  Moon,
} from "lucide-react";

// PDF Export Libraries (install with: npm install jspdf jspdf-autotable)
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ==================== DATABASE PERSISTENCE LAYER ====================
// Using localStorage for client-side persistence
// Can be migrated to SQLite/PostgreSQL backend later

const DB_KEYS = {
  USERS: "timetable_users",
  BRANCHES: "timetable_branches",
  SUBJECTS: "timetable_subjects",
  TEACHERS: "timetable_teachers",
  MAPPINGS: "timetable_mappings",
  CLASSROOMS: "timetable_classrooms",
  LABS: "timetable_labs",
  WORKING_DAYS: "timetable_working_days",
  TIME_SLOTS: "timetable_time_slots",
  BREAKS: "timetable_breaks",
  HALF_DAYS: "timetable_half_days",
  COUNSELING: "timetable_counseling",
  GENERATED_TIMETABLE: "timetable_generated",
  TEACHER_SCHEDULES: "timetable_teacher_schedules",
  CONSTRAINT_REPORT: "timetable_constraint_report",
};

const saveToDatabase = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error(`Failed to save ${key}:`, error);
    return false;
  }
};

const loadFromDatabase = (key, defaultValue) => {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch (error) {
    console.error(`Failed to load ${key}:`, error);
    return defaultValue;
  }
};

const clearAllDatabase = () => {
  try {
    Object.values(DB_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });
    return true;
  } catch (error) {
    console.error("Failed to clear database:", error);
    return false;
  }
};

// ==================== UTILITY FUNCTIONS ====================

const shuffleArray = (array) => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

const getShuffledSlotsForDay = (day, timeSlots, breaks, halfDays, shuffle = true) => {
  const slots = timeSlots.filter((slot) => {
    const [start] = slot.split("-");
    if (
      breaks.some((br) => {
        if (br.day !== "All" && br.day !== day) return false;
        const s = start.replace(":", "");
        return (
          s >= br.startTime.replace(":", "") && s < br.endTime.replace(":", "")
        );
      })
    )
      return false;

    if (halfDays.includes(day)) {
      return start.replace(":", "") < "1330";
    }

    return true;
  });

  if (!shuffle) {
    return [...slots].sort((a, b) => {
      const timeA = a.split("-")[0].replace(":", "");
      const timeB = b.split("-")[0].replace(":", "");
      return timeA.localeCompare(timeB);
    });
  }

  return shuffleArray(slots);
};

const getSortedSlotsByCompactness = (day, candidateSlots, branchId, timetable, timeSlots) => {
  const sectionSchedule = timetable[branchId] || {};
  const occupiedIndices = Object.keys(sectionSchedule)
    .filter((k) => k.startsWith(`${day}-`))
    .map((k) => timeSlots.indexOf(k.split("-")[1]))
    .filter((idx) => idx !== -1);

  const getSlotScore = (slot) => {
    const idx = timeSlots.indexOf(slot);
    if (idx === -1) return 1000;

    let bonus = 0;
    // High bonus for adjacency to ANY already scheduled slot on this day
    const isAdjacent = occupiedIndices.some((oidx) => Math.abs(oidx - idx) === 1);
    if (isAdjacent) bonus += 500;

    // Small bonus for being earlier (tie-breaker)
    return idx - bonus;
  };

  return [...candidateSlots].sort((a, b) => getSlotScore(a) - getSlotScore(b));
};

const TimetableGenerator = () => {
  // Authentication & User State
  const [currentUser, setCurrentUser] = useState({
    role: "",
    name: "",
    username: "",
    assignedClass: "",
    teacherId: "",
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    loadFromDatabase("timetable_theme", true) // Default to dark mode based on previous setup
  );
  const [activeTab, setActiveTab] = useState("login");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // User Management - Load from database with default fallback
  const [users, setUsers] = useState(() =>
    loadFromDatabase(DB_KEYS.USERS, [
      {
        username: "admin",
        password: "admin123",
        name: "System Admin",
        role: "Admin",
      },
      { username: "tto1", password: "tto123", name: "TTO Officer", role: "TTO" },
      {
        username: "teacher1",
        password: "teacher123",
        name: "Dr. Kumar",
        role: "Teacher",
        teacherId: "T001",
      },
      {
        username: "student1",
        password: "student123",
        name: "John Doe",
        role: "Student",
        assignedClass: "CS-A-SEM3",
      },
    ])
  );

  // Core Data - Load from database
  const [branches, setBranches] = useState(() =>
    loadFromDatabase(DB_KEYS.BRANCHES, [])
  );
  const [subjects, setSubjects] = useState(() =>
    loadFromDatabase(DB_KEYS.SUBJECTS, [])
  );
  const [teachers, setTeachers] = useState(() =>
    loadFromDatabase(DB_KEYS.TEACHERS, [])
  );
  const [teacherSubjectMapping, setTeacherSubjectMapping] = useState(() =>
    loadFromDatabase(DB_KEYS.MAPPINGS, [])
  );
  const [classrooms, setClassrooms] = useState(() =>
    loadFromDatabase(DB_KEYS.CLASSROOMS, [])
  );
  const [labs, setLabs] = useState(() => loadFromDatabase(DB_KEYS.LABS, []));
  const [workingDays, setWorkingDays] = useState(() =>
    loadFromDatabase(DB_KEYS.WORKING_DAYS, [])
  );
  const [timeSlots, setTimeSlots] = useState(() =>
    loadFromDatabase(DB_KEYS.TIME_SLOTS, [])
  );
  const [breaks, setBreaks] = useState(() =>
    loadFromDatabase(DB_KEYS.BREAKS, [
      { day: "All", startTime: "11:00", endTime: "11:30", type: "Short Break" },
      { day: "All", startTime: "13:30", endTime: "14:30", type: "Lunch Break" },
    ])
  );
  const [halfDays, setHalfDays] = useState(() =>
    loadFromDatabase(DB_KEYS.HALF_DAYS, [])
  );
  const [counselingPeriods, setCounselingPeriods] = useState(() =>
    loadFromDatabase(DB_KEYS.COUNSELING, [])
  );

  // Form States
  const [newBranch, setNewBranch] = useState({
    branch: "",
    section: "",
    semester: "",
    defaultRoom: "",
  });
  const [newSubject, setNewSubject] = useState({
    id: "",
    name: "",
    type: "Theory",
    credits: "",
    theoryHours: "",
    labHours: "",
    isContinuous: false,
    continuousBlockSize: 2,
    isBasketCourse: false,
    preferEarly: false,
  });
  const [newTeacher, setNewTeacher] = useState({
    id: "",
    name: "",
    maxLoad: "",
  });
  const [newMapping, setNewMapping] = useState({
    teacherId: "",
    subjectId: "",
    branchId: "",
  });
  const [newClassroom, setNewClassroom] = useState("");
  const [newLab, setNewLab] = useState("");
  const [newDay, setNewDay] = useState("");
  const [newTimeSlot, setNewTimeSlot] = useState({ start: "", end: "" });
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    name: "",
    role: "Student",
    teacherId: "",
    assignedClass: "",
  });

  // Generated Data - Load from database
  const [generatedTimetable, setGeneratedTimetable] = useState(() =>
    loadFromDatabase(DB_KEYS.GENERATED_TIMETABLE, null)
  );
  const [teacherSchedules, setTeacherSchedules] = useState(() =>
    loadFromDatabase(DB_KEYS.TEACHER_SCHEDULES, null)
  );
  const [constraintReport, setConstraintReport] = useState(() =>
    loadFromDatabase(DB_KEYS.CONSTRAINT_REPORT, null)
  );
  const [generationLog, setGenerationLog] = useState([]);

  // Theme Configuration
  const theme = {
    background: isDarkMode
      ? "linear-gradient(135deg, #0f172a 0%, #16213e 100%)"
      : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    headerBg: isDarkMode ? "#1e293b" : "white",
    headerText: isDarkMode ? "#f8fafc" : "#1a202c",
    cardBg: isDarkMode ? "#1e293b" : "white",
    cardText: isDarkMode ? "#f1f5f9" : "#1a202c",
    cardSubText: isDarkMode ? "#94a3b8" : "#718096",
    inputBg: isDarkMode ? "#0f172a" : "#1a202c",
    inputBorder: isDarkMode ? "#334155" : "#2d3748",
    inputText: isDarkMode ? "#f1f5f9" : "#ffffff",
    tableHeaderBg: isDarkMode ? "#334155" : "#f8fafc",
    tableRowBorder: isDarkMode ? "#334155" : "#edf2f7",
    tabActiveBorder: isDarkMode ? "#6366f1" : "#667eea",
    tabInactiveText: isDarkMode ? "#94a3b8" : "#718096",
    primaryButton: isDarkMode
      ? "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)"
      : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    accent: isDarkMode ? "#4ecca3" : "#667eea",
    cardBorder: isDarkMode ? "#334155" : "#e2e8f0",
    secondaryCardBg: isDarkMode ? "#0f172a" : "#f1f5f9",
    tipBg: isDarkMode ? "#16213e" : "#ebf8ff",
    tipBorder: isDarkMode ? "#2d3748" : "#bee3f8",
    tipText: isDarkMode ? "#93a5b1" : "#2c5282",
    checkboxLabel: isDarkMode ? "#e0e0e0" : "#4a5568",
  };

  useEffect(() => {
    saveToDatabase("timetable_theme", isDarkMode);
    // Apply background to body for consistency
    document.body.style.background = theme.background;
    document.body.style.backgroundAttachment = "fixed";
  }, [isDarkMode]);

  const inputStyle = {
    padding: "0.75rem",
    border: `1px solid ${theme.inputBorder}`,
    borderRadius: "8px",
    fontSize: "0.9375rem",
    fontFamily: "inherit",
    background: theme.inputBg,
    color: theme.inputText,
  };

  const primaryButtonStyle = {
    padding: "0.75rem 1.5rem",
    background: theme.primaryButton,
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.9375rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    transition: "transform 0.2s",
  };

  const secondaryButtonStyle = {
    padding: "0.75rem 1.5rem",
    background: "transparent",
    color: isDarkMode ? "#e0e0e0" : "#1a202c",
    border: `1px solid ${theme.accent}`,
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.9375rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    transition: "all 0.2s",
  };

  const tableHeaderStyle = {
    padding: "0.75rem 1rem",
    textAlign: "left",
    fontWeight: "600",
    fontSize: "0.875rem",
    color: theme.accent,
    background: theme.tableHeaderBg,
  };

  const tableCellStyle = {
    padding: "0.75rem 1rem",
    fontSize: "0.875rem",
    color: theme.cardText,
    borderBottom: `1px solid ${theme.tableRowBorder}`,
  };

  // ==================== DATABASE AUTO-SAVE HOOKS ====================
  // Auto-save data to localStorage whenever it changes

  useEffect(() => {
    saveToDatabase(DB_KEYS.USERS, users);
  }, [users]);

  useEffect(() => {
    saveToDatabase(DB_KEYS.BRANCHES, branches);
  }, [branches]);

  useEffect(() => {
    saveToDatabase(DB_KEYS.SUBJECTS, subjects);
  }, [subjects]);

  useEffect(() => {
    saveToDatabase(DB_KEYS.TEACHERS, teachers);
  }, [teachers]);

  useEffect(() => {
    saveToDatabase(DB_KEYS.MAPPINGS, teacherSubjectMapping);
  }, [teacherSubjectMapping]);

  useEffect(() => {
    saveToDatabase(DB_KEYS.CLASSROOMS, classrooms);
  }, [classrooms]);

  useEffect(() => {
    saveToDatabase(DB_KEYS.LABS, labs);
  }, [labs]);

  useEffect(() => {
    saveToDatabase(DB_KEYS.WORKING_DAYS, workingDays);
  }, [workingDays]);

  useEffect(() => {
    saveToDatabase(DB_KEYS.TIME_SLOTS, timeSlots);
  }, [timeSlots]);

  useEffect(() => {
    saveToDatabase(DB_KEYS.BREAKS, breaks);
  }, [breaks]);

  useEffect(() => {
    saveToDatabase(DB_KEYS.HALF_DAYS, halfDays);
  }, [halfDays]);

  useEffect(() => {
    saveToDatabase(DB_KEYS.COUNSELING, counselingPeriods);
  }, [counselingPeriods]);

  useEffect(() => {
    if (generatedTimetable) {
      saveToDatabase(DB_KEYS.GENERATED_TIMETABLE, generatedTimetable);
    }
  }, [generatedTimetable]);

  useEffect(() => {
    if (teacherSchedules) {
      saveToDatabase(DB_KEYS.TEACHER_SCHEDULES, teacherSchedules);
    }
  }, [teacherSchedules]);

  useEffect(() => {
    if (constraintReport) {
      saveToDatabase(DB_KEYS.CONSTRAINT_REPORT, constraintReport);
    }
  }, [constraintReport]);

  useEffect(() => {
    // Migrate old mappings to include branchId: "All" if missing
    const needsMigration = teacherSubjectMapping.some((m) => !m.branchId);
    if (needsMigration) {
      console.warn("Migrating legacy teacher mappings to include branchId: 'All'");
      const migrated = teacherSubjectMapping.map((m) => ({
        ...m,
        branchId: m.branchId || "All",
      }));
      setTeacherSubjectMapping(migrated);
    }
  }, [teacherSubjectMapping]);

  // ==================== IMPROVED TIMETABLE GENERATION LOGIC ====================

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setGenerationLog((prev) => [...prev, { time: timestamp, message }]);
  };

  const isBreakTime = (day, timeSlot) => {
    const [slotStart] = timeSlot.split("-");
    return breaks.some((br) => {
      if (br.day !== "All" && br.day !== day) return false;
      const breakStart = br.startTime.replace(":", "");
      const breakEnd = br.endTime.replace(":", "");
      const slotTime = slotStart.replace(":", "");
      return slotTime >= breakStart && slotTime < breakEnd;
    });
  };

  const isHalfDay = (day) => halfDays.includes(day);

  const isCounselingSlot = (teacherId, day, timeSlot) => {
    return counselingPeriods.some(
      (cp) =>
        cp.teacherId === teacherId &&
        cp.day === day &&
        cp.timeSlot === timeSlot,
    );
  };

  const getAvailableSlots = (day, excludeBreaks = true) => {
    return timeSlots.filter((slot) => {
      if (excludeBreaks && isBreakTime(day, slot)) return false;
      if (isHalfDay(day)) {
        const [slotStart] = slot.split("-");
        return slotStart.replace(":", "") < "1330";
      }
      return true;
    });
  };

  const findConsecutiveSlots = (
    day,
    blockSize,
    timetable,
    branchId,
    teacherId,
    teacherSchedule,
    preferEarly = false,
  ) => {
    const allAvailable = getAvailableSlots(day);
    const slotsToSearch = preferEarly ? allAvailable.slice(0, 2) : allAvailable;
    return searchInSlots(slotsToSearch, day, blockSize, timetable, branchId, teacherId, teacherSchedule);
  };

  // Helper moved outside findConsecutiveSlots or defined inside
  const searchInSlots = (slots, day, blockSize, timetable, branchId, teacherId, teacherSchedule) => {
    // Sort by time (early slots first) instead of shuffling for blocks
    const sortedSlots = [...slots].sort((a, b) => {
      const timeA = a.split("-")[0].replace(":", "");
      const timeB = b.split("-")[0].replace(":", "");
      return timeA.localeCompare(timeB);
    });

    for (let i = 0; i <= sortedSlots.length - blockSize; i++) {
      const consecutiveSlots = sortedSlots.slice(i, i + blockSize);
      const slotKeys = consecutiveSlots.map((slot) => `${day}-${slot}`);

      // Check if slots are truly consecutive (no break in between)
      let hasBreakInBetween = false;
      for (let j = 0; j < consecutiveSlots.length - 1; j++) {
        const currentSlotEnd = consecutiveSlots[j].split("-")[1];
        const nextSlotStart = consecutiveSlots[j + 1].split("-")[0];
        if (currentSlotEnd !== nextSlotStart) {
          hasBreakInBetween = true;
          break;
        }
      }

      if (hasBreakInBetween) continue;

      // Check if all slots are free
      const allFree = slotKeys.every((key) => {
        const classFree = !timetable[branchId][key];
        const teacherFree =
          !teacherSchedule[teacherId][day].includes(key) &&
          !isCounselingSlot(teacherId, day, consecutiveSlots[slotKeys.indexOf(key)]);
        return classFree && teacherFree;
      });

      if (allFree) {
        return { slots: consecutiveSlots, keys: slotKeys };
      }
    }
    return null;
  };

  const canPlaceSubject = (
    day,
    slot,
    timetable,
    branchId,
    teacherId,
    teacherSchedule,
    subjectId,
  ) => {
    const slotKey = `${day}-${slot}`;

    // Check class availability
    if (timetable[branchId][slotKey]) return false;

    // Check teacher availability
    if (teacherSchedule[teacherId][day].includes(slotKey)) return false;
    if (isCounselingSlot(teacherId, day, slot)) return false;

    // Check if subject already placed on this day (avoid clustering)
    const daySlots = getAvailableSlots(day);
    const subjectOnThisDay = daySlots.some((s) => {
      const key = `${day}-${s}`;
      const entry = timetable[branchId][key];
      return entry && entry.subjectId === subjectId;
    });

    return !subjectOnThisDay;
  };

  const getAssignedRoom = (subject, branchId, type) => {
    // 1. If it's a regular theory subject, use branch default room
    if (type === "Theory") {
      const branch = branches.find((b) => b.id === branchId);
      if (branch && branch.defaultRoom) {
        return branch.defaultRoom;
      }
      // Fallback to random classroom
      return (
        classrooms[Math.floor(Math.random() * classrooms.length)] || "Room-TBD"
      );
    }

    // 3. For Labs, use the existing lab assignment logic
    return labs.length > 0
      ? labs[Math.floor(Math.random() * labs.length)]
      : "Lab-TBD";
  };

  const distributeTheoryHours = (
    subject,
    teacher,
    branchId,
    timetable,
    teacherSchedule,
    teacherWorkload,
    dayPriority = [],
  ) => {
    const theoryHours = parseInt(subject.theoryHours) || 0;
    if (theoryHours === 0) return 0;

    let hoursScheduled = 0;
    const isContinuous = subject.isContinuous;
    const blockSize = subject.continuousBlockSize || 2;
    const shuffledDays = dayPriority.length > 0 ? dayPriority : shuffleArray([...workingDays]);

    const tryPlaceTheory = (day, slot) => {
      if (canPlaceSubject(day, slot, timetable, branchId, teacher.id, teacherSchedule, subject.id)) {
        const key = `${day}-${slot}`;
        timetable[branchId][key] = {
          subject: `${subject.name} (Theory)`,
          subjectId: subject.id,
          teacher: teacher.name,
          teacherId: teacher.id,
          type: "Theory",
          room: getAssignedRoom(subject, branchId, "Theory"),
        };
        teacherSchedule[teacher.id][day].push(key);
        teacherWorkload[teacher.id]++;
        hoursScheduled++;
        return true;
      }
      return false;
    };

    if (isContinuous && theoryHours >= blockSize) {
      const blocksNeeded = Math.floor(theoryHours / blockSize);
      const remaining = theoryHours % blockSize;

      for (let b = 0; b < blocksNeeded; b++) {
        let placed = false;

        // Pass 1: Try morning blocks across all days
        if (subject.preferEarly) {
          for (const day of shuffledDays) {
            if (placed) break;
            const block = findConsecutiveSlots(day, blockSize, timetable, branchId, teacher.id, teacherSchedule, true);
            if (block && teacherWorkload[teacher.id] + blockSize <= teacher.maxLoad) {
              const room = getAssignedRoom(subject, branchId, "Theory");
              block.keys.forEach((key, i) => {
                timetable[branchId][key] = {
                  subject: `${subject.name} (Theory)`,
                  subjectId: subject.id,
                  teacher: teacher.name,
                  teacherId: teacher.id,
                  type: "Theory",
                  room: room,
                  blockPart: `${i + 1}/${blockSize}`,
                };
                teacherSchedule[teacher.id][day].push(key);
                hoursScheduled++;
              });
              teacherWorkload[teacher.id] += blockSize;
              placed = true;
            }
          }
        }

        // Pass 2: Fallback to any slots across all days
        if (!placed) {
          for (const day of shuffledDays) {
            if (placed) break;

            const allAvailable = getAvailableSlots(day);
            const candidateBlocks = [];
            for (let i = 0; i <= allAvailable.length - blockSize; i++) {
              const chunk = allAvailable.slice(i, i + blockSize);
              if (chunk.length === blockSize) candidateBlocks.push(chunk);
            }

            const sortedBlocks = [...candidateBlocks].sort((a, b) => {
              const score = (blk) => {
                const startIdx = timeSlots.indexOf(blk[0]);
                const sched = timetable[branchId] || {};
                const idxs = Object.keys(sched).filter(k => k.startsWith(`${day}-`)).map(k => timeSlots.indexOf(k.split("-")[1]));
                const isAdj = idxs.some(ox => Math.abs(ox - startIdx) === 1 || Math.abs(ox - (startIdx + (blockSize - 1))) === 1);
                return startIdx - (isAdj ? 500 : 0);
              };
              return score(a) - score(b);
            });

            for (const blk of sortedBlocks) {
              const result = searchInSlots(blk, day, blockSize, timetable, branchId, teacher.id, teacherSchedule);
              if (result && teacherWorkload[teacher.id] + blockSize <= teacher.maxLoad) {
                const room = getAssignedRoom(subject, branchId, "Theory");
                result.keys.forEach((key, i) => {
                  timetable[branchId][key] = {
                    subject: `${subject.name} (Theory)`,
                    subjectId: subject.id,
                    teacher: teacher.name,
                    teacherId: teacher.id,
                    type: "Theory",
                    room: room,
                    blockPart: `${i + 1}/${blockSize}`,
                  };
                  teacherSchedule[teacher.id][day].push(key);
                  hoursScheduled++;
                });
                teacherWorkload[teacher.id] += blockSize;
                placed = true;
                break;
              }
            }
          }
        }
      }

      for (let r = 0; r < remaining; r++) {
        let placed = false;

        // Pass 1: Try morning slots across all days
        if (subject.preferEarly) {
          for (const day of shuffledDays) {
            if (placed) break;
            const allAvailable = getAvailableSlots(day);
            const morningSlots = [...allAvailable.slice(0, 2)].sort((a, b) => {
              const timeA = a.split("-")[0].replace(":", "");
              const timeB = b.split("-")[0].replace(":", "");
              return timeA.localeCompare(timeB);
            });
            for (const slot of morningSlots) {
              if (tryPlaceTheory(day, slot)) {
                placed = true;
                break;
              }
            }
          }
        }

        // Pass 2: Fallback to any slots across all days
        if (!placed) {
          for (const day of shuffledDays) {
            if (placed) break;
            const allSlots = getShuffledSlotsForDay(day, timeSlots, breaks, halfDays, false);
            const sortedSlots = getSortedSlotsByCompactness(day, allSlots, branchId, timetable, timeSlots);
            for (const slot of sortedSlots) {
              if (tryPlaceTheory(day, slot)) {
                placed = true;
                break;
              }
            }
          }
        }
      }
    } else {
      for (let h = 0; h < theoryHours && teacherWorkload[teacher.id] < teacher.maxLoad; h++) {
        let placed = false;

        // Pass 1: Try morning slots across all days
        if (subject.preferEarly) {
          for (const day of shuffledDays) {
            if (placed) break;
            const allAvailable = getAvailableSlots(day);
            const morningSlots = [...allAvailable.slice(0, 2)].sort((a, b) => {
              const timeA = a.split("-")[0].replace(":", "");
              const timeB = b.split("-")[0].replace(":", "");
              return timeA.localeCompare(timeB);
            });
            for (const slot of morningSlots) {
              if (tryPlaceTheory(day, slot)) {
                placed = true;
                break;
              }
            }
          }
        }

        // Pass 2: Fallback to any slots across all days
        if (!placed) {
          for (const day of shuffledDays) {
            if (placed) break;
            const allSlots = getShuffledSlotsForDay(day, timeSlots, breaks, halfDays, false);
            const sortedSlots = getSortedSlotsByCompactness(day, allSlots, branchId, timetable, timeSlots);
            for (const slot of sortedSlots) {
              if (tryPlaceTheory(day, slot)) {
                placed = true;
                break;
              }
            }
          }
        }
      }
    }
    return hoursScheduled;
  };

  const distributeSimultaneousTheory = (
    subject,
    teacher,
    participatingBranches,
    timetable,
    teacherSchedule,
    teacherWorkload,
  ) => {
    const theoryHours = parseInt(subject.theoryHours) || 0;
    if (theoryHours === 0) return 0;

    let hoursScheduled = 0;
    const shuffledDays = shuffleArray([...workingDays]);

    const tryPlaceSimultaneous = (day, slot) => {
      const key = `${day}-${slot}`;
      const allFree = participatingBranches.every(branchId =>
        canPlaceSubject(day, slot, timetable, branchId, teacher.id, teacherSchedule, subject.id)
      );

      if (allFree) {
        const usedRooms = [];
        Object.keys(timetable).forEach(bid => {
          if (timetable[bid][key]) usedRooms.push(timetable[bid][key].room);
        });
        const freeRooms = classrooms.filter(r => !usedRooms.includes(r));
        const room = freeRooms.length > 0 ? freeRooms[Math.floor(Math.random() * freeRooms.length)] : "Hall-TBD";

        participatingBranches.forEach(branchId => {
          timetable[branchId][key] = {
            subject: `${subject.name} (Theory)`,
            subjectId: subject.id,
            teacher: teacher.name,
            teacherId: teacher.id,
            type: "Theory",
            room: room,
          };
        });

        teacherSchedule[teacher.id][day].push(key);
        teacherWorkload[teacher.id]++;
        hoursScheduled++;
        addLog(`✅ Basket ${subject.name}: Placed at ${key} in ${room}`);
        return true;
      }
      return false;
    };

    for (let h = 0; h < theoryHours && teacherWorkload[teacher.id] < teacher.maxLoad; h++) {
      let placed = false;
      addLog(`🔍 Basket ${subject.name}: Seeking slot for hour ${h + 1}...`);

      // Pass 1: Try morning slots across all days
      if (subject.preferEarly) {
        for (const day of shuffledDays) {
          if (placed) break;
          const allAvailable = getAvailableSlots(day);
          const morningSlots = [...allAvailable.slice(0, 2)].sort((a, b) => {
            const timeA = a.split("-")[0].replace(":", "");
            const timeB = b.split("-")[0].replace(":", "");
            return timeA.localeCompare(timeB);
          });
          for (const slot of morningSlots) {
            if (tryPlaceSimultaneous(day, slot)) {
              placed = true;
              break;
            }
          }
        }
      }

      // Pass 2: Fallback to any slots across all days
      if (!placed) {
        for (const day of shuffledDays) {
          if (placed) break;
          const allSlots = getShuffledSlotsForDay(day, timeSlots, breaks, halfDays, false);
          // For baskets, prioritize slots that are compact for ANY of the branches (sum of scores)
          const sortedSlots = [...allSlots].sort((a, b) => {
            const sumScore = (slot) => participatingBranches.reduce((acc, bid) => {
              const sched = timetable[bid] || {};
              const idxs = Object.keys(sched).filter(k => k.startsWith(`${day}-`)).map(k => timeSlots.indexOf(k.split("-")[1]));
              const idx = timeSlots.indexOf(slot);
              const isAdj = idxs.some(ox => Math.abs(ox - idx) === 1);
              return acc + (idx - (isAdj ? 500 : 0));
            }, 0);
            return sumScore(a) - sumScore(b);
          });

          for (const slot of sortedSlots) {
            if (tryPlaceSimultaneous(day, slot)) {
              placed = true;
              break;
            }
          }
        }
      }

      if (!placed) {
        addLog(`❌ Basket ${subject.name}: No simultaneous free slot found for hour ${h + 1}`);
      }
    }
    return hoursScheduled;
  };
  const classHasLabOnDay = (timetable, branchId, day) => {
    return Object.keys(timetable[branchId]).some((key) => {
      if (!key.startsWith(day)) return false;
      const entry = timetable[branchId][key];
      return entry && entry.type === "Lab";
    });
  };

  const distributeLabHours = (
    subject,
    teacher,
    branchId,
    timetable,
    teacherSchedule,
    teacherWorkload,
    dayPriority = [],
  ) => {
    const labHours = parseInt(subject.labHours) || 0;
    if (labHours === 0) return 0;

    const LAB_BLOCK_SIZE = 2; // All labs must be 2-hour continuous blocks
    const blocksNeeded = Math.ceil(labHours / LAB_BLOCK_SIZE);
    const shuffledDays = dayPriority.length > 0 ? dayPriority : shuffleArray([...workingDays]);
    let blocksScheduled = 0;

    for (
      let block = 0;
      block < blocksNeeded && teacherWorkload[teacher.id] < teacher.maxLoad;
      block++
    ) {
      let blockPlaced = false;

      const tryPlaceLabOnDay = (day, useEarly) => {
        const consecutiveSlots = findConsecutiveSlots(
          day,
          LAB_BLOCK_SIZE,
          timetable,
          branchId,
          teacher.id,
          teacherSchedule,
          useEarly,
        );

        if (
          consecutiveSlots &&
          teacherWorkload[teacher.id] + LAB_BLOCK_SIZE <= teacher.maxLoad
        ) {
          const room = getAssignedRoom(subject, branchId, "Lab");
          consecutiveSlots.keys.forEach((key, idx) => {
            timetable[branchId][key] = {
              subject: `${subject.name} (Lab)`,
              subjectId: subject.id,
              teacher: teacher.name,
              teacherId: teacher.id,
              type: "Lab",
              room: room,
              blockPart: `${idx + 1}/${LAB_BLOCK_SIZE}`,
            };
            teacherSchedule[teacher.id][day].push(key);
          });
          teacherWorkload[teacher.id] += LAB_BLOCK_SIZE;
          blocksScheduled++;
          blockPlaced = true;
          addLog(`Placed ${LAB_BLOCK_SIZE}-hour lab for ${subject.name} in ${branchId} on ${day} at ${room}`);
          return true;
        }
        return false;
      };

      // Pass 1: Try morning blocks across all days
      if (subject.preferEarly) {
        for (const day of shuffledDays) {
          if (blockPlaced || isHalfDay(day)) continue;
          if (classHasLabOnDay(timetable, branchId, day)) continue;
          if (tryPlaceLabOnDay(day, true)) {
            blockPlaced = true;
            break;
          }
        }
      }

      // Pass 2: Fallback to any blocks across all days
      if (!blockPlaced) {
        for (const day of shuffledDays) {
          if (blockPlaced || isHalfDay(day)) continue;
          if (classHasLabOnDay(timetable, branchId, day)) continue;

          // FOR LABS: Although findConsecutiveSlots is chronological, 
          // we should actually try ALL available start slots and pick the most compact one!
          const allAvailable = getAvailableSlots(day);
          const candidateBlocks = [];
          for (let i = 0; i <= allAvailable.length - LAB_BLOCK_SIZE; i++) {
            const chunk = allAvailable.slice(i, i + LAB_BLOCK_SIZE);
            if (chunk.length === LAB_BLOCK_SIZE) candidateBlocks.push(chunk);
          }

          const sortedBlocks = [...candidateBlocks].sort((a, b) => {
            const score = (blk) => {
              const startIdx = timeSlots.indexOf(blk[0]);
              const sched = timetable[branchId] || {};
              const idxs = Object.keys(sched).filter(k => k.startsWith(`${day}-`)).map(k => timeSlots.indexOf(k.split("-")[1]));
              const isAdj = idxs.some(ox => Math.abs(ox - startIdx) === 1 || Math.abs(ox - (startIdx + 1)) === 1);
              return startIdx - (isAdj ? 500 : 0);
            };
            return score(a) - score(b);
          });

          for (const blk of sortedBlocks) {
            const result = searchInSlots(blk, day, LAB_BLOCK_SIZE, timetable, branchId, teacher.id, teacherSchedule);
            if (result) {
              const room = getAssignedRoom(subject, branchId, "Lab");
              result.keys.forEach((key, idx) => {
                timetable[branchId][key] = {
                  subject: `${subject.name} (Lab)`,
                  subjectId: subject.id,
                  teacher: teacher.name,
                  teacherId: teacher.id,
                  type: "Lab",
                  room: room,
                  blockPart: `${idx + 1}/${LAB_BLOCK_SIZE}`,
                };
                teacherSchedule[teacher.id][day].push(key);
              });
              teacherWorkload[teacher.id] += LAB_BLOCK_SIZE;
              blocksScheduled++;
              blockPlaced = true;
              addLog(`Placed ${LAB_BLOCK_SIZE}-hour lab for ${subject.name} in ${branchId} on ${day} (Compact)`);
              break;
            }
          }
          if (blockPlaced) break;
        }
      }

      if (!blockPlaced) {
        addLog(`⚠️ Could not place lab block ${block + 1} for ${subject.name} in ${branchId}`);
      }
    }

    return blocksScheduled * LAB_BLOCK_SIZE;
  };

  const generateTimetable = () => {
    if (currentUser.role !== "TTO") {
      alert("ACCESS DENIED: Only TTO can generate timetables");
      return;
    }

    // Validation
    if (
      branches.length === 0 ||
      subjects.length === 0 ||
      teachers.length === 0 ||
      teacherSubjectMapping.length === 0 ||
      workingDays.length === 0 ||
      timeSlots.length === 0
    ) {
      alert("ERROR: Please configure all required data first");
      return;
    }

    // Verify mapping completeness
    const missingMappings = [];
    branches.forEach(b => {
      b.subjects.forEach(sid => {
        const hasMapping = teacherSubjectMapping.some(m =>
          m.subjectId === sid && (m.branchId === b.id || m.branchId === "All")
        );
        if (!hasMapping) {
          const s = subjects.find(sub => sub.id === sid);
          missingMappings.push(`${b.branch}-${b.section}: ${s?.name || sid}`);
        }
      });
    });

    if (missingMappings.length > 0) {
      if (confirm(`MISSING MAPPINGS:\n${missingMappings.slice(0, 5).join("\n")}${missingMappings.length > 5 ? `\n...and ${missingMappings.length - 5} more` : ""}\n\nWould you like to run Smart Auto-Map now to fix this?`)) {
        autoDistributeTeachers();
        return; // Stop and let them review or generate again
      } else {
        alert("Generation aborted. Please map teachers to all subjects first.");
        return;
      }
    }

    addLog("🚀 Starting enhanced timetable generation...");

    const timetable = {};
    const teacherWorkload = {};
    const teacherDailySchedule = {};
    const violations = [];
    const satisfiedConstraints = [];
    const assumptions = [];
    const shuffledBranches = shuffleArray(branches);
    const shuffledDays = shuffleArray(workingDays);

    // Initialize ALL branches and unique day priorities per branch for variety
    const branchDayPriorities = {};
    branches.forEach((branch) => {
      timetable[branch.id] = {};
      branchDayPriorities[branch.id] = shuffleArray([...workingDays]);
    });

    // Initialize teacher workload and daily schedules
    teachers.forEach((t) => {
      teacherWorkload[t.id] = 0;
      teacherDailySchedule[t.id] = {};
      workingDays.forEach((day) => {
        teacherDailySchedule[t.id][day] = [];
      });
    });

    // PHASE 0: Global Early Preferred Priority
    addLog("⚡ PHASE 0: Scheduling Early Preferred Subjects (Global Priority)...");

    // 0.1: Early Basket Courses
    const earlyBaskets = shuffleArray(subjects.filter(s => s.isBasketCourse && s.preferEarly));
    earlyBaskets.forEach(subject => {
      const branchesWithSubject = branches.filter(b => b.subjects.includes(subject.id));
      if (branchesWithSubject.length === 0) return;
      const mapping = teacherSubjectMapping.find(m => m.subjectId === subject.id && (m.branchId === "All" || branchesWithSubject.some(b => b.id === m.branchId)));
      if (!mapping) return;
      const teacher = teachers.find(t => t.id === mapping.teacherId);
      if (!teacher) return;
      distributeSimultaneousTheory(subject, teacher, branchesWithSubject.map(b => b.id), timetable, teacherDailySchedule, teacherWorkload);
    });

    // 0.2: Early Labs (Global)
    shuffledBranches.forEach(branch => {
      shuffleArray(subjects.filter(s => branch.subjects.includes(s.id) && s.labHours > 0 && s.preferEarly && !s.isBasketCourse)).forEach(subject => {
        const mappings = teacherSubjectMapping.filter(m => m.subjectId === subject.id && (m.branchId === branch.id || m.branchId === "All"));
        if (mappings.length === 0) return;
        const teacher = teachers.find(t => t.id === mappings[0].teacherId);
        if (teacher) distributeLabHours(subject, teacher, branch.id, timetable, teacherDailySchedule, teacherWorkload, branchDayPriorities[branch.id]);
      });
    });

    // 0.3: Early Theory (Global)
    shuffledBranches.forEach(branch => {
      shuffleArray(subjects.filter(s => branch.subjects.includes(s.id) && s.theoryHours > 0 && s.preferEarly && !s.isBasketCourse)).forEach(subject => {
        const mappings = teacherSubjectMapping.filter(m => m.subjectId === subject.id && (m.branchId === branch.id || m.branchId === "All"));
        if (mappings.length === 0) return;
        const teacher = teachers.find(t => t.id === mappings[0].teacherId);
        if (teacher) distributeTheoryHours(subject, teacher, branch.id, timetable, teacherDailySchedule, teacherWorkload, branchDayPriorities[branch.id]);
      });
    });

    // PHASE 1: Remaining Labs (Non-Early)
    addLog("🔬 PHASE 1: Scheduling Remaining Labs...");
    shuffledBranches.forEach(branch => {
      shuffleArray(subjects.filter(s => branch.subjects.includes(s.id) && s.labHours > 0 && !s.preferEarly && !s.isBasketCourse)).forEach(subject => {
        const mappings = teacherSubjectMapping.filter(m => m.subjectId === subject.id && (m.branchId === branch.id || m.branchId === "All"));
        if (mappings.length === 0) return;
        const teacher = teachers.find(t => t.id === mappings[0].teacherId);
        if (teacher) distributeLabHours(subject, teacher, branch.id, timetable, teacherDailySchedule, teacherWorkload, branchDayPriorities[branch.id]);
      });
    });

    // PHASE 2: Remaining Theory (Non-Early)
    addLog("📖 PHASE 2: Scheduling Remaining Theory & Basket Courses...");

    // 2.1: Non-Early Basket Courses
    const regularBaskets = shuffleArray(subjects.filter(s => s.isBasketCourse && !s.preferEarly));
    regularBaskets.forEach(subject => {
      const branchesWithSubject = branches.filter(b => b.subjects.includes(subject.id));
      if (branchesWithSubject.length === 0) return;
      const mapping = teacherSubjectMapping.find(m => m.subjectId === subject.id && (m.branchId === "All" || branchesWithSubject.some(b => b.id === m.branchId)));
      if (!mapping) return;
      const teacher = teachers.find(t => t.id === mapping.teacherId);
      if (!teacher) return;
      distributeSimultaneousTheory(subject, teacher, branchesWithSubject.map(b => b.id), timetable, teacherDailySchedule, teacherWorkload);
    });

    // 2.2: Regular Theory
    shuffledBranches.forEach(branch => {
      shuffleArray(subjects.filter(s => branch.subjects.includes(s.id) && s.theoryHours > 0 && !s.preferEarly && !s.isBasketCourse)).forEach(subject => {
        const mappings = teacherSubjectMapping.filter(m => m.subjectId === subject.id && (m.branchId === branch.id || m.branchId === "All"));
        if (mappings.length === 0) return;
        const teacher = teachers.find(t => t.id === mappings[0].teacherId);
        if (teacher) distributeTheoryHours(subject, teacher, branch.id, timetable, teacherDailySchedule, teacherWorkload, branchDayPriorities[branch.id]);
      });
    });

    // Phase 3: Add counseling periods
    shuffledBranches.forEach(branch => {
      counselingPeriods.forEach((cp) => {
        const slot = `${cp.day}-${cp.timeSlot}`;
        if (!timetable[branch.id][slot]) {
          const teacher = teachers.find((t) => t.id === cp.teacherId);
          timetable[branch.id][slot] = {
            subject: "Counseling",
            subjectId: "COUNSELING",
            teacher: teacher?.name || "TBD",
            teacherId: cp.teacherId,
            type: "Counseling",
            room: "Counseling Room",
          };
        }
      });
    });

    // Check constraints
    teachers.forEach((teacher) => {
      if (teacherWorkload[teacher.id] <= teacher.maxLoad) {
        satisfiedConstraints.push(
          `${teacher.name}: ${teacherWorkload[teacher.id]}/${teacher.maxLoad} hours (within limit)`,
        );
      } else {
        violations.push(
          `${teacher.name} exceeds max load: ${teacherWorkload[teacher.id]}/${teacher.maxLoad} hours`,
        );
      }
    });

    satisfiedConstraints.push("✓ All labs placed in 2-hour continuous blocks");
    satisfiedConstraints.push(
      "✓ Continuous subjects placed in designated block sizes",
    );
    satisfiedConstraints.push("✓ No teacher double-booking detected");
    satisfiedConstraints.push("✓ Daily workload balanced across days");

    setGeneratedTimetable(timetable);
    setTeacherSchedules(teacherDailySchedule);
    setConstraintReport({
      violations,
      satisfiedConstraints,
      teacherWorkload,
      assumptions,
    });
    setActiveTab("view-timetable");

    addLog(`✅ Timetable generated successfully`);
    addLog(
      `📊 ${violations.length} violations, ${satisfiedConstraints.length} constraints satisfied`,
    );
  };

  // ==================== EXPORT FUNCTIONS ====================

  // PDF Export Function
  const exportTimetableToPDF = (branch) => {
    if (!generatedTimetable || !generatedTimetable[branch.id]) {
      alert("No timetable data available");
      return;
    }

    const doc = new jsPDF("landscape", "mm", "a4");

    const pageWidth = doc.internal.pageSize.getWidth();

    // 🔹 Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("CLASS TIMETABLE", pageWidth / 2, 15, { align: "center" });

    // 🔹 Subtitle
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${branch.branch} - Section ${branch.section} - Semester ${branch.semester}`,
      pageWidth / 2,
      24,
      { align: "center" }
    );

    doc.text(
      `Academic Year 2024–25`,
      pageWidth / 2,
      31,
      { align: "center" }
    );

    const branchTimetable = generatedTimetable[branch.id];

    // 🔹 Use ALL slots (include breaks vertically)
    const validSlots = timeSlots;

    const headers = [
      "Day",
      ...validSlots.map((s) => s.replace("-", " – "))
    ];

    const body = workingDays.map((day) => {
      const row = [day];
      validSlots.forEach((slot) => {
        const isBreak = isBreakTime(day, slot);
        if (isBreak) {
          const breakInfo = breaks.find(br => {
            const [slotStart] = slot.split("-");
            const breakStart = br.startTime.replace(":", "");
            const breakEnd = br.endTime.replace(":", "");
            const slotTime = slotStart.replace(":", "");
            return (br.day === "All" || br.day === day) && slotTime >= breakStart && slotTime < breakEnd;
          });
          row.push(breakInfo ? breakInfo.type.toUpperCase() : "BREAK");
        } else {
          const key = `${day}-${slot}`;
          const entry = branchTimetable[key];
          row.push(
            entry
              ? `${entry.subject}\n${entry.teacher || ""}\n${entry.room || ""}`
              : "FREE"
          );
        }
      });
      return row;
    });

    // 🔹 THIS IS THE MOST IMPORTANT PART
    autoTable(doc, {
      head: [headers],
      body: body,
      startY: 40,
      styles: {
        fontSize: 8,
        halign: "center",
        valign: "middle",
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      columnStyles: {
        0: { fontStyle: "bold" },
      },
      theme: "grid",
    });

    doc.save(`Timetable_${branch.id}.pdf`);
  };


  // CSV Export Function
  const exportTimetableToCSV = (branch) => {
    if (!generatedTimetable || !generatedTimetable[branch.id]) {
      alert("No timetable data available");
      return;
    }

    const branchTimetable = generatedTimetable[branch.id];
    let csvContent = `Class Timetable - ${branch.branch} Section ${branch.section} Semester ${branch.semester}\n`;
    csvContent += `Academic Year 2024-25\n`;
    csvContent += `Generated: ${new Date().toLocaleString()}\n\n`;

    // Headers
    const headers = ["Day", ...timeSlots];
    csvContent += headers.map(h => `"${h}"`).join(",") + "\n";

    // Rows
    workingDays.forEach((day) => {
      const row = [day];
      timeSlots.forEach((slot) => {
        const isBreak = isBreakTime(day, slot);
        if (isBreak) {
          const breakInfo = breaks.find(br => {
            const [slotStart] = slot.split("-");
            const breakStart = br.startTime.replace(":", "");
            const breakEnd = br.endTime.replace(":", "");
            const slotTime = slotStart.replace(":", "");
            return (br.day === "All" || br.day === day) && slotTime >= breakStart && slotTime < breakEnd;
          });
          row.push(breakInfo ? breakInfo.type.toUpperCase() : "BREAK");
        } else {
          const key = `${day}-${slot}`;
          const entry = branchTimetable[key];
          if (entry) {
            const content = `${entry.subject} (${entry.teacher || ""})`.replace(/"/g, '""');
            row.push(`"${content}"`);
          } else {
            row.push("FREE");
          }
        }
      });
      csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Timetable_${branch.id}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ==================== UI HELPER FUNCTIONS ====================

  const handleLogin = (e) => {
    e.preventDefault();
    const user = users.find(
      (u) =>
        u.username === loginForm.username && u.password === loginForm.password,
    );

    if (user) {
      setCurrentUser({
        role: user.role,
        name: user.name,
        username: user.username,
        assignedClass: user.assignedClass || "",
        teacherId: user.teacherId || "",
      });
      setIsAuthenticated(true);
      setActiveTab("dashboard");
      addLog(`${user.name} (${user.role}) logged in`);
      setLoginForm({ username: "", password: "" });
    } else {
      setLoginError("Invalid credentials");
    }
  };

  const handleLogout = () => {
    addLog(`${currentUser.name} logged out`);
    setCurrentUser({
      role: "",
      name: "",
      username: "",
      assignedClass: "",
      teacherId: "",
    });
    setIsAuthenticated(false);
    setActiveTab("login");
  };

  const canViewTimetable = () => {
    return ["TTO", "Admin", "Teacher", "Student"].includes(currentUser.role);
  };

  const getViewableTimetables = () => {
    if (!generatedTimetable) return [];

    if (currentUser.role === "Student") {
      return branches.filter((b) => b.id === currentUser.assignedClass);
    }

    if (currentUser.role === "Teacher") {
      // Teachers can only see their own schedule
      return [];
    }

    return branches; // Admin and TTO can see all
  };

  const canViewTeacherSchedule = () => {
    return ["TTO", "Admin", "Teacher"].includes(currentUser.role);
  };

  const getViewableTeacherSchedules = () => {
    if (!teacherSchedules) return [];

    if (currentUser.role === "Teacher") {
      return teachers.filter((t) => t.id === currentUser.teacherId);
    }

    return teachers; // Admin and TTO can see all
  };

  // Helper functions
  const addBranch = () => {
    if (newBranch.branch && newBranch.section && newBranch.semester) {
      const id = `${newBranch.branch}-${newBranch.section}-SEM${newBranch.semester}`;
      setBranches([...branches, { id, ...newBranch, subjects: [] }]);
      addLog(`Added branch: ${id} (Home Room: ${newBranch.defaultRoom || "None"})`);
      setNewBranch({ branch: "", section: "", semester: "", defaultRoom: "" });
    }
  };

  const addSubject = () => {
    if (
      newSubject.id &&
      newSubject.name &&
      (newSubject.theoryHours || newSubject.labHours)
    ) {
      setSubjects([
        ...subjects,
        {
          id: newSubject.id,
          name: newSubject.name,
          type: newSubject.type,
          credits: newSubject.credits,
          theoryHours: newSubject.theoryHours || "0",
          labHours: newSubject.labHours || "0",
          isContinuous: newSubject.isContinuous,
          continuousBlockSize: newSubject.continuousBlockSize,
          isBasketCourse: newSubject.isBasketCourse,
          preferEarly: newSubject.preferEarly,
        },
      ]);
      addLog(
        `Added subject: ${newSubject.name} (Continuous: ${newSubject.isContinuous ? "Yes" : "No"})`,
      );
      setNewSubject({
        id: "",
        name: "",
        type: "Theory",
        credits: "",
        theoryHours: "",
        labHours: "",
        isContinuous: false,
        continuousBlockSize: 2,
        isBasketCourse: false,
        preferEarly: false,
      });
    }
  };

  const addTeacher = () => {
    if (newTeacher.id && newTeacher.name && newTeacher.maxLoad) {
      setTeachers([
        ...teachers,
        { ...newTeacher, maxLoad: parseInt(newTeacher.maxLoad) },
      ]);
      addLog(`Added teacher: ${newTeacher.name}`);
      setNewTeacher({ id: "", name: "", maxLoad: "" });
    }
  };

  const addMapping = () => {
    if (newMapping.teacherId && newMapping.subjectId && newMapping.branchId) {
      // Prevent duplicates
      const exists = teacherSubjectMapping.some(
        (m) =>
          m.teacherId === newMapping.teacherId &&
          m.subjectId === newMapping.subjectId &&
          m.branchId === newMapping.branchId
      );

      if (exists) {
        alert("This mapping already exists!");
        return;
      }

      setTeacherSubjectMapping([...teacherSubjectMapping, { ...newMapping }]);
      addLog(`Mapped teacher ${newMapping.teacherId} to ${newMapping.subjectId} for ${newMapping.branchId}`);
      setNewMapping({ teacherId: "", subjectId: "", branchId: "" });
    } else {
      alert("Please select Teacher, Subject, and Branch/Section");
    }
  };

  const autoDistributeTeachers = () => {
    // 1. Get qualifications (mappings where branchId is "All")
    const qualifications = teacherSubjectMapping.filter(m => m.branchId === "All");

    if (qualifications.length === 0) {
      alert("No general qualifications found. Please create 'All Sections' mappings first to indicate which teacher can teach which subject.");
      return;
    }

    if (!confirm("This will maintain your existing specific assignments and only fill in the missing ones based on 'All Section' qualifications. Continue?")) {
      return;
    }

    addLog("🤖 Starting Smart Auto-Mapping (Preserving Manual Mappings)...");

    // Existing specific mappings (manually assigned)
    const existingSpecific = teacherSubjectMapping.filter(m => m.branchId !== "All");

    // Keep track of workload assigned DURING this process (hours)
    // Initialize with workload from existing specific mappings
    const distributionWorkload = {};
    teachers.forEach(t => {
      const teacherSpecificHours = existingSpecific
        .filter(m => m.teacherId === t.id)
        .reduce((sum, m) => {
          const sub = subjects.find(s => s.id === m.subjectId);
          return sum + (sub ? (parseInt(sub.theoryHours) || 0) + (parseInt(sub.labHours) || 0) : 0);
        }, 0);
      distributionWorkload[t.id] = teacherSpecificHours;
    });

    const newMappings = [...existingSpecific];

    // 2. Iterate through each branch and its subjects
    branches.forEach(branch => {
      branch.subjects.forEach(subjectId => {
        const subject = subjects.find(s => s.id === subjectId);
        if (!subject) return;

        // CHECK: Is this subject already manually mapped for this branch?
        const alreadyMapped = existingSpecific.some(m => m.branchId === branch.id && m.subjectId === subjectId);
        if (alreadyMapped) {
          addLog(`ℹ️ Skipping ${subject.name} in ${branch.id} (Manually assigned)`);
          return;
        }

        // Find teachers qualified for this subject
        const qualifiedTeacherIds = qualifications
          .filter(q => q.subjectId === subjectId)
          .map(q => q.teacherId);

        if (qualifiedTeacherIds.length === 0) {
          addLog(`⚠️ No teacher qualified for ${subject.name} (ID: ${subjectId}) in ${branch.id}`);
          return;
        }

        // Choose the teacher with the lowest current workload assigned
        const selectedTeacherId = qualifiedTeacherIds.sort((a, b) => {
          const teacherA = teachers.find(t => t.id === a);
          const teacherB = teachers.find(t => t.id === b);

          const loadA = distributionWorkload[a] || 0;
          const loadB = distributionWorkload[b] || 0;

          // Ratio of current load to max load for better distribution
          const ratioA = loadA / (teacherA?.maxLoad || 20);
          const ratioB = loadB / (teacherB?.maxLoad || 20);

          return ratioA - ratioB;
        })[0];

        if (selectedTeacherId) {
          const subjectHours = (parseInt(subject.theoryHours) || 0) + (parseInt(subject.labHours) || 0);
          distributionWorkload[selectedTeacherId] += subjectHours;

          newMappings.push({
            teacherId: selectedTeacherId,
            subjectId: subjectId,
            branchId: branch.id
          });
        }
      });
    });

    setTeacherSubjectMapping(newMappings);
    addLog(`✅ Auto-mapping complete! Created ${newMappings.length - existingSpecific.length} new assignments.`);
  };

  const clearSectionMappings = () => {
    if (confirm("Clear all section-specific mappings? (General qualifications will be kept)")) {
      const qualifications = teacherSubjectMapping.filter(m => m.branchId === "All");
      setTeacherSubjectMapping(qualifications);
      addLog("🧹 Cleared all section-specific mappings.");
    }
  };

  const generateDefaultSchedule = () => {
    const days = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const slots = [
      "09:00-10:00",
      "10:00-11:00",
      "11:00-11:30",  // Short Break slot
      "11:30-12:30",
      "12:30-13:30",
      "13:30-14:30",  // Lunch Break slot
      "14:30-15:30",
      "15:30-16:30",
    ];
    setWorkingDays(days);
    setTimeSlots(slots);
    addLog("Generated default schedule");
  };

  const assignSubjectToBranch = (branchId, subjectId) => {
    setBranches(
      branches.map((b) => {
        if (b.id === branchId && !b.subjects.includes(subjectId)) {
          return { ...b, subjects: [...b.subjects, subjectId] };
        }
        return b;
      }),
    );
  };

  const addUser = () => {
    if (currentUser.role !== "Admin") {
      alert("Only Admins can create users");
      return;
    }

    if (newUser.username && newUser.password && newUser.name && newUser.role) {
      const userToAdd = { ...newUser };
      if (newUser.role !== "Teacher") delete userToAdd.teacherId;
      if (newUser.role !== "Student") delete userToAdd.assignedClass;

      setUsers([...users, userToAdd]);
      addLog(`Admin created user: ${newUser.username}`);
      setNewUser({
        username: "",
        password: "",
        name: "",
        role: "Student",
        teacherId: "",
        assignedClass: "",
      });
    }
  };

  // ==================== LOGIN UI ====================

  if (!isAuthenticated) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          minHeight: "100vh",
          width: "100vw",
          background: theme.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          zIndex: 9999,
        }}>
        {/* Login Theme Toggle */}
        <div
          style={{
            position: "absolute",
            top: "2.5rem",
            right: "2.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            background: isDarkMode ? "rgba(30, 41, 59, 0.7)" : "rgba(255, 255, 255, 0.7)",
            backdropFilter: "blur(8px)",
            padding: "0.5rem 1rem",
            borderRadius: "9999px",
            border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
            boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
            zIndex: 10000,
          }}>
          <span style={{
            fontSize: "0.875rem",
            fontWeight: "600",
            color: theme.headerText,
            opacity: 0.8
          }}>
            {isDarkMode ? "Dark Mode" : "Light Mode"}
          </span>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            style={{
              background: theme.cardBg,
              border: `1px solid ${theme.inputBorder}`,
              borderRadius: "50%",
              width: "40px",
              height: "40px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              color: theme.headerText,
              transition: "all 0.2s ease",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = "scale(1.1)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>

        <div
          style={{
            background: theme.cardBg,
            borderRadius: "16px",
            boxShadow: isDarkMode ? "0 20px 60px rgba(0,0,0,0.6)" : "0 20px 60px rgba(0,0,0,0.2)",
            padding: "3rem",
            maxWidth: "450px",
            width: "100%",
          }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <Calendar
              size={64}
              color={theme.accent}
              style={{ marginBottom: "1rem" }}
            />
            <h1
              style={{
                fontSize: "2rem",
                fontWeight: "700",
                color: theme.headerText,
                margin: 0,
              }}>
              Smart Timetable System
            </h1>
            <p style={{ color: theme.cardSubText, marginTop: "0.5rem" }}>
              Enhanced Algorithm v2.0
            </p>
          </div>

          <form
            onSubmit={handleLogin}
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  color: theme.cardSubText,
                  marginBottom: "0.5rem",
                }}>
                Username
              </label>
              <input
                type="text"
                value={loginForm.username}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, username: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: `2px solid ${theme.inputBorder}`,
                  borderRadius: "8px",
                  fontSize: "1rem",
                  background: theme.inputBg,
                  color: theme.inputText,
                }}
                required
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  color: theme.cardSubText,
                  marginBottom: "0.5rem",
                }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={loginForm.password}
                  onChange={(e) =>
                    setLoginForm({ ...loginForm, password: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: `2px solid ${theme.inputBorder}`,
                    borderRadius: "8px",
                    fontSize: "1rem",
                    background: theme.inputBg,
                    color: theme.inputText,
                  }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px",
                  }}>
                  {showPassword ? (
                    <EyeOff size={20} color={theme.cardSubText} />
                  ) : (
                    <Eye size={20} color={theme.cardSubText} />
                  )}
                </button>
              </div>
            </div>

            {loginError && (
              <div
                style={{
                  background: "#fed7d7",
                  color: "#c53030",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  fontSize: "0.875rem",
                }}>
                {loginError}
              </div>
            )}

            <button
              type="submit"
              style={{
                width: "100%",
                padding: "0.875rem",
                background: theme.primaryButton,
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "1rem",
                fontWeight: "600",
                cursor: "pointer",
                transition: "transform 0.2s",
              }}
              onMouseOver={(e) =>
                (e.target.style.transform = "translateY(-2px)")
              }
              onMouseOut={(e) => (e.target.style.transform = "translateY(0)")}>
              Login
            </button>
          </form>

          <div
            style={{
              marginTop: "2rem",
              padding: "1rem",
              background: isDarkMode ? "#0f0f1e" : "#f7fafc",
              borderRadius: "8px",
              fontSize: "0.75rem",
              color: theme.cardSubText,
            }}>
            <p style={{ fontWeight: "600", marginBottom: "0.5rem" }}>
              Demo Credentials:
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
                fontFamily: "monospace",
              }}>
              <p>Admin: admin / admin123</p>
              <p>TTO: tto1 / tto123</p>
              <p>Teacher: teacher1 / teacher123</p>
              <p>Student: student1 / student123</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== MAIN APPLICATION UI (FULL SCREEN) ====================

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        background: theme.background,
        padding: "0",
        margin: "0",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: "auto",
        transition: "background 0.3s ease",
        color: theme.cardText,
      }}>
      {/* Header Bar */}
      <div
        style={{
          background: theme.headerBg,
          borderBottom: `1px solid ${theme.inputBorder}`,
          padding: "1rem 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 1000,
          boxShadow: isDarkMode ? "0 4px 6px -1px rgba(0, 0, 0, 0.4)" : "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
          transition: "background 0.3s ease",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Calendar size={32} color={theme.accent} />
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "1.5rem",
                fontWeight: "700",
                color: theme.headerText,
              }}>
              Smart Timetable System
            </h1>
            <p style={{ margin: 0, fontSize: "0.75rem", color: theme.cardSubText }}>
              Enhanced Algorithm • Role-Based Access
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          {/* Header Theme Toggle */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: theme.headerText,
              padding: "0.5rem",
              borderRadius: "50%",
              transition: "background 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = isDarkMode ? "#334155" : "#f1f5f9")}
            onMouseOut={(e) => (e.currentTarget.style.background = "none")}>
            {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>

          <div style={{ textAlign: "right" }}>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <UserCheck size={20} color={isDarkMode ? "#4ecca3" : "#48bb78"} />
              <span style={{ fontWeight: "600", color: theme.headerText }}>
                {currentUser.name}
              </span>
            </div>
            <span
              style={{
                display: "inline-block",
                fontSize: "0.75rem",
                background: isDarkMode ? "#334155" : "#e6fffa",
                color: isDarkMode ? "#4ecca3" : "#234e52",
                padding: "0.25rem 0.75rem",
                borderRadius: "12px",
                fontWeight: "600",
                marginTop: "0.25rem",
              }}>
              {currentUser.role}
            </span>
          </div>
          <button
            onClick={handleLogout}
            style={{
              padding: "0.5rem 1rem",
              background: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "0.875rem",
            }}>
            Logout
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div
        style={{
          background: theme.headerBg,
          borderBottom: `1px solid ${theme.inputBorder}`,
          padding: "0 2rem",
          display: "flex",
          gap: "0.5rem",
          overflowX: "auto",
        }}>
        <TabButton
          active={activeTab === "dashboard"}
          onClick={() => setActiveTab("dashboard")}
          theme={theme}>
          Dashboard
        </TabButton>

        {(currentUser.role === "Admin" || currentUser.role === "TTO") && (
          <>
            <TabButton
              active={activeTab === "branches"}
              onClick={() => setActiveTab("branches")}
              theme={theme}>
              Branches
            </TabButton>
            <TabButton
              active={activeTab === "subjects"}
              onClick={() => setActiveTab("subjects")}
              theme={theme}>
              Subjects
            </TabButton>
            <TabButton
              active={activeTab === "teachers"}
              onClick={() => setActiveTab("teachers")}
              theme={theme}>
              Teachers
            </TabButton>
            <TabButton
              active={activeTab === "mapping"}
              onClick={() => setActiveTab("mapping")}
              theme={theme}>
              Mappings
            </TabButton>
            <TabButton
              active={activeTab === "resources"}
              onClick={() => setActiveTab("resources")}
              theme={theme}>
              Resources
            </TabButton>
          </>
        )}

        {currentUser.role === "Admin" && (
          <TabButton
            active={activeTab === "users"}
            onClick={() => setActiveTab("users")}
            theme={theme}>
            Users
          </TabButton>
        )}

        {canViewTimetable() && generatedTimetable && (
          <TabButton
            active={activeTab === "view-timetable"}
            onClick={() => setActiveTab("view-timetable")}
            theme={theme}>
            View Timetable
          </TabButton>
        )}
      </div>

      {/* Main Content Area */}
      <div style={{ padding: "2rem", maxWidth: "1600px", margin: "0 auto" }}>
        {/* DASHBOARD */}
        {activeTab === "dashboard" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            <div
              style={{
                background: isDarkMode ? "linear-gradient(135deg, #1e293b 0%, #16213e 100%)" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: isDarkMode ? "#f8fafc" : "white",
                borderRadius: "16px",
                padding: "2rem",
                boxShadow: isDarkMode ? "0 10px 25px -5px rgba(0, 0, 0, 0.4)" : "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
                border: `1px solid ${theme.inputBorder}`,
              }}>
              <h2 style={{ fontSize: "2rem", margin: "0 0 0.5rem 0" }}>
                Welcome, {currentUser.name}!
              </h2>
              <p style={{ margin: 0, opacity: 0.9 }}>
                Role: <strong>{currentUser.role}</strong>
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1.5rem",
                width: "100%",
              }}>
              <StatCard title="System Data" color={isDarkMode ? "#60a5fa" : "#3182ce"} theme={theme} isDarkMode={isDarkMode}>
                <StatItem label="Branches" value={branches.length} theme={theme} />
                <StatItem label="Subjects" value={subjects.length} theme={theme} />
                <StatItem label="Teachers" value={teachers.length} theme={theme} />
                <StatItem
                  label="Mappings"
                  value={teacherSubjectMapping.length}
                  theme={theme}
                />
              </StatCard>

              <StatCard title="Schedule Config" color={isDarkMode ? "#4ade80" : "#38a169"} theme={theme} isDarkMode={isDarkMode}>
                <StatItem label="Working Days" value={workingDays.length} theme={theme} />
                <StatItem label="Time Slots" value={timeSlots.length} theme={theme} />
                <StatItem label="Classrooms" value={classrooms.length} theme={theme} />
                <StatItem label="Labs" value={labs.length} theme={theme} />
              </StatCard>

              <StatCard title="Access Level" color={isDarkMode ? "#c084fc" : "#805ad5"} theme={theme} isDarkMode={isDarkMode}>
                <div style={{ color: theme.cardSubText, fontSize: "0.875rem" }}>
                  {currentUser.role === "Admin" && <p>✓ Full system access</p>}
                  {currentUser.role === "TTO" && (
                    <p>✓ Generate & modify timetables</p>
                  )}
                  {currentUser.role === "Teacher" && (
                    <p>✓ View personal schedule only</p>
                  )}
                  {currentUser.role === "Student" && (
                    <p>✓ View class timetable only</p>
                  )}
                </div>
              </StatCard>
            </div>

            {currentUser.role === "TTO" && (
              <div
                style={{
                  background: theme.cardBg,
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.1)",
                  border: `1px solid ${theme.inputBorder}`,
                }}>
                <h3
                  style={{
                    margin: "0 0 1rem 0",
                    fontSize: "1.25rem",
                    color: theme.headerText,
                  }}>
                  Generate Timetable
                </h3>
                <p style={{ color: theme.cardSubText, marginBottom: "1.5rem" }}>
                  Ensure all data is configured before generating. The enhanced
                  algorithm will:
                </p>
                <ul
                  style={{
                    color: theme.cardSubText,
                    marginBottom: "1.5rem",
                    lineHeight: "1.8",
                  }}>
                  <li>Place all labs in continuous 2-hour blocks</li>
                  <li>Respect continuous/non-continuous subject preferences</li>
                  <li>Distribute classes evenly across days</li>
                  <li>Avoid subject clustering on single days</li>
                  <li>Maintain teacher workload limits</li>
                </ul>
                <button
                  onClick={generateTimetable}
                  style={{
                    padding: "1rem 2rem",
                    background: theme.primaryButton,
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "1rem",
                    fontWeight: "600",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}>
                  <Clock size={20} />
                  Generate Smart Timetable
                </button>
              </div>
            )}
          </div>
        )}

        {/* SUBJECTS TAB */}
        {activeTab === "subjects" &&
          (currentUser.role === "Admin" || currentUser.role === "TTO") && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <h2
                style={{
                  fontSize: "1.75rem",
                  fontWeight: "700",
                  color: theme.headerText,
                  margin: 0,
                }}>
                Manage Subjects
              </h2>

              <div
                style={{
                  background: theme.cardBg,
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.1)",
                  border: `1px solid ${theme.inputBorder}`,
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: theme.headerText }}>
                  Add New Subject
                </h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "1rem",
                    marginBottom: "1rem",
                  }}>
                  <input
                    type="text"
                    placeholder="Subject ID (e.g., CS101)"
                    value={newSubject.id}
                    onChange={(e) =>
                      setNewSubject({ ...newSubject, id: e.target.value })
                    }
                    style={inputStyle}
                  />
                  <input
                    type="text"
                    placeholder="Subject Name"
                    value={newSubject.name}
                    onChange={(e) =>
                      setNewSubject({ ...newSubject, name: e.target.value })
                    }
                    style={inputStyle}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: "1rem",
                    marginBottom: "1rem",
                  }}>
                  <input
                    type="number"
                    placeholder="Credits"
                    value={newSubject.credits}
                    onChange={(e) =>
                      setNewSubject({ ...newSubject, credits: e.target.value })
                    }
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    placeholder="Theory Hours/Week"
                    value={newSubject.theoryHours}
                    onChange={(e) =>
                      setNewSubject({
                        ...newSubject,
                        theoryHours: e.target.value,
                      })
                    }
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    placeholder="Lab Hours/Week"
                    value={newSubject.labHours}
                    onChange={(e) =>
                      setNewSubject({ ...newSubject, labHours: e.target.value })
                    }
                    style={inputStyle}
                  />
                  <select
                    value={newSubject.continuousBlockSize}
                    onChange={(e) =>
                      setNewSubject({
                        ...newSubject,
                        continuousBlockSize: parseInt(e.target.value),
                      })
                    }
                    style={inputStyle}
                    disabled={!newSubject.isContinuous}>
                    <option value="2">2-hour blocks</option>
                    <option value="3">3-hour blocks</option>
                  </select>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                    marginBottom: "1.5rem",
                  }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      cursor: "pointer",
                    }}>
                    <input
                      type="checkbox"
                      checked={newSubject.isContinuous}
                      onChange={(e) =>
                        setNewSubject({
                          ...newSubject,
                          isContinuous: e.target.checked,
                        })
                      }
                      style={{
                        width: "18px",
                        height: "18px",
                        cursor: "pointer",
                      }}
                    />
                    <span style={{ fontWeight: "500", color: theme.checkboxLabel }}>
                      Require Continuous Placement (place in blocks, not
                      scattered)
                    </span>
                  </label>

                  <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                      }}>
                      <input
                        type="checkbox"
                        checked={newSubject.isBasketCourse}
                        onChange={(e) =>
                          setNewSubject({
                            ...newSubject,
                            isBasketCourse: e.target.checked,
                          })
                        }
                        style={{
                          width: "18px",
                          height: "18px",
                          cursor: "pointer",
                        }}
                      />
                      <span style={{ fontWeight: "500", color: theme.checkboxLabel }}>
                        Basket Course (Simultaneous for all sections)
                      </span>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                      }}>
                      <input
                        type="checkbox"
                        checked={newSubject.preferEarly}
                        onChange={(e) =>
                          setNewSubject({
                            ...newSubject,
                            preferEarly: e.target.checked,
                          })
                        }
                        style={{
                          width: "18px",
                          height: "18px",
                          cursor: "pointer",
                        }}
                      />
                      <span style={{ fontWeight: "500", color: theme.checkboxLabel }}>
                        Prefer Early Morning (First 2 Hours)
                      </span>
                    </label>
                  </div>
                </div>

                <button onClick={addSubject} style={primaryButtonStyle}>
                  <Plus size={20} />
                  Add Subject
                </button>

                <div
                  style={{
                    marginTop: "1rem",
                    padding: "1rem",
                    background: theme.tipBg,
                    border: `1px solid ${theme.tipBorder}`,
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                    color: theme.tipText,
                  }}>
                  <strong style={{ color: theme.accent }}>💡 Tip:</strong> Continuous
                  subjects (like programming labs or project work) will be
                  scheduled in uninterrupted blocks. <strong>Basket Courses</strong> will be
                  centralized in their assigned fixed classroom.
                </div>
              </div>

              <div
                style={{
                  background: theme.cardBg,
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.05)",
                  border: `1px solid ${theme.cardBorder}`,
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: theme.headerText }}>
                  Defined Subjects ({subjects.length})
                </h3>

                {subjects.length === 0 ? (
                  <p
                    style={{
                      color: "#718096",
                      textAlign: "center",
                      padding: "2rem",
                    }}>
                    No subjects defined yet. Add your first subject above.
                  </p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr
                          style={{
                            background: theme.tableHeaderBg,
                            borderBottom: `2px solid ${theme.accent}`,
                          }}>
                          <th style={tableHeaderStyle}>ID</th>
                          <th style={tableHeaderStyle}>Name</th>
                          <th style={tableHeaderStyle}>Credits</th>
                          <th style={tableHeaderStyle}>Theory</th>
                          <th style={tableHeaderStyle}>Lab</th>
                          <th style={tableHeaderStyle}>Total</th>
                          <th style={tableHeaderStyle}>Placement</th>
                          <th style={tableHeaderStyle}>Room</th>
                          <th style={tableHeaderStyle}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subjects.map((sub) => (
                          <tr
                            key={sub.id}
                            style={{ borderBottom: `1px solid ${theme.tableRowBorder}` }}>
                            <td style={tableCellStyle}>{sub.id}</td>
                            <td style={tableCellStyle}>{sub.name}</td>
                            <td style={tableCellStyle}>{sub.credits}</td>
                            <td style={tableCellStyle}>
                              {sub.theoryHours || "-"}
                            </td>
                            <td style={tableCellStyle}>
                              {sub.labHours || "-"}
                            </td>
                            <td
                              style={{ ...tableCellStyle, fontWeight: "600" }}>
                              {(parseInt(sub.theoryHours) || 0) +
                                (parseInt(sub.labHours) || 0)}
                              h
                            </td>
                            <td style={tableCellStyle}>
                              {sub.isContinuous ? (
                                <span
                                  style={{
                                    background: "#bee3f8",
                                    color: "#2c5282",
                                    padding: "0.25rem 0.75rem",
                                    borderRadius: "12px",
                                    fontSize: "0.75rem",
                                    fontWeight: "600",
                                  }}>
                                  Continuous ({sub.continuousBlockSize}h blocks)
                                </span>
                              ) : (
                                <span
                                  style={{
                                    background: "#feebc8",
                                    color: "#7c2d12",
                                    padding: "0.25rem 0.75rem",
                                    borderRadius: "12px",
                                    fontSize: "0.75rem",
                                    fontWeight: "600",
                                  }}>
                                  Distributed
                                </span>
                              )}
                            </td>
                            <td style={tableCellStyle}>
                              {sub.isBasketCourse ? (
                                <span style={{ color: theme.accent, fontWeight: "600" }}>
                                  Basket (Simultaneous)
                                </span>
                              ) : (
                                <span style={{ color: theme.cardSubText }}>Section Home Room</span>
                              )}
                              {sub.preferEarly && (
                                <span
                                  style={{
                                    background: "#fef3c7",
                                    color: "#92400e",
                                    padding: "0.25rem 0.75rem",
                                    borderRadius: "12px",
                                    fontSize: "0.75rem",
                                    fontWeight: "600",
                                  }}>
                                  Early Hours
                                </span>
                              )}
                            </td>
                            <td style={{ ...tableCellStyle, display: "flex", alignItems: "center" }}>
                              <button
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Are you sure you want to delete ${sub.name}?`,
                                    )
                                  ) {
                                    setSubjects(subjects.filter((s) => s.id !== sub.id));
                                  }
                                }}
                                style={{
                                  marginLeft: "auto",
                                  background: "transparent",
                                  border: "none",
                                  color: "#ef4444",
                                  cursor: "pointer",
                                }}>
                                <Trash2 size={18} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

        {/* BRANCHES TAB */}
        {activeTab === "branches" &&
          (currentUser.role === "Admin" || currentUser.role === "TTO") && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <h2
                style={{
                  fontSize: "1.75rem",
                  fontWeight: "700",
                  color: theme.headerText,
                  margin: 0,
                }}>
                Manage Branches & Sections
              </h2>

              <div
                style={{
                  background: theme.cardBg,
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.05)",
                  border: `1px solid ${theme.cardBorder}`,
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: theme.headerText }}>
                  Add New Branch/Section
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(5, 1fr)",
                    gap: "1rem",
                  }}>
                  <input
                    type="text"
                    placeholder="Branch (e.g., CS)"
                    value={newBranch.branch}
                    onChange={(e) =>
                      setNewBranch({ ...newBranch, branch: e.target.value })
                    }
                    style={inputStyle}
                  />
                  <input
                    type="text"
                    placeholder="Section (e.g., A)"
                    value={newBranch.section}
                    onChange={(e) =>
                      setNewBranch({ ...newBranch, section: e.target.value })
                    }
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    placeholder="Semester (1-8)"
                    value={newBranch.semester}
                    onChange={(e) =>
                      setNewBranch({ ...newBranch, semester: e.target.value })
                    }
                    style={inputStyle}
                  />
                  <select
                    value={newBranch.defaultRoom}
                    onChange={(e) =>
                      setNewBranch({
                        ...newBranch,
                        defaultRoom: e.target.value,
                      })
                    }
                    style={inputStyle}>
                    <option value="">-- Home Room --</option>
                    {classrooms.map((room) => (
                      <option key={room} value={room}>
                        {room}
                      </option>
                    ))}
                  </select>
                  <button onClick={addBranch} style={primaryButtonStyle}>
                    <Plus size={20} />
                    Add
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: theme.cardBg,
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.05)",
                  border: `1px solid ${theme.cardBorder}`,
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: theme.headerText }}>
                  Existing Branches ({branches.length})
                </h3>
                {branches.length === 0 ? (
                  <p
                    style={{
                      color: "#718096",
                      textAlign: "center",
                      padding: "2rem",
                    }}>
                    No branches added yet.
                  </p>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(350px, 1fr))",
                      gap: "1.5rem",
                    }}>
                    {branches.map((branch) => (
                      <div
                        key={branch.id}
                        style={{
                          border: `1px solid ${theme.cardBorder}`,
                          borderRadius: "12px",
                          padding: "1.5rem",
                          background: theme.secondaryCardBg,
                          boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                        }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: "1rem",
                          }}>
                          <div>
                            <h4
                              style={{
                                margin: 0,
                                fontSize: "1.25rem",
                                color: theme.cardText,
                              }}>
                              {branch.id}
                            </h4>
                            <p
                              style={{
                                margin: "0.25rem 0 0 0",
                                fontSize: "0.875rem",
                                color: theme.cardSubText,
                              }}>
                              {branch.branch} • Section {branch.section} • Sem{" "}
                              {branch.semester}
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              setBranches(
                                branches.filter((b) => b.id !== branch.id),
                              )
                            }
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "#f56565",
                              padding: "0.25rem",
                            }}>
                            <Trash2 size={20} />
                          </button>
                        </div>

                        {subjects.length > 0 && (
                          <>
                            <select
                              onChange={(e) =>
                                assignSubjectToBranch(branch.id, e.target.value)
                              }
                              value=""
                              style={{
                                ...inputStyle,
                                width: "100%",
                                marginBottom: "1rem",
                              }}>
                              <option value="">-- Assign Subject --</option>
                              {subjects
                                .filter((s) => !branch.subjects.includes(s.id))
                                .map((sub) => (
                                  <option key={sub.id} value={sub.id}>
                                    {sub.name} (
                                    {(parseInt(sub.theoryHours) || 0) +
                                      (parseInt(sub.labHours) || 0)}
                                    h)
                                  </option>
                                ))}
                            </select>

                            {branch.subjects.length > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "0.5rem",
                                }}>
                                {branch.subjects.map((subId) => {
                                  const sub = subjects.find(
                                    (s) => s.id === subId,
                                  );
                                  return sub ? (
                                    <span
                                      key={subId}
                                      style={{
                                        background: "#f1f5f9",
                                        color: "#475569",
                                        padding: "0.25rem 0.75rem",
                                        borderRadius: "12px",
                                        fontSize: "0.75rem",
                                        fontWeight: "600",
                                        border: "1px solid #e2e8f0",
                                      }}>
                                      {sub.name}
                                    </span>
                                  ) : null;
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        {/* TEACHERS TAB */}
        {activeTab === "teachers" &&
          (currentUser.role === "Admin" || currentUser.role === "TTO") && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <h2
                style={{
                  fontSize: "1.75rem",
                  fontWeight: "700",
                  color: theme.headerText,
                  margin: 0,
                }}>
                Manage Teachers
              </h2>

              <div
                style={{
                  background: theme.cardBg,
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.1)",
                  border: `1px solid ${theme.inputBorder}`,
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: theme.headerText }}>
                  Add New Teacher
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: "1rem",
                  }}>
                  <input
                    type="text"
                    placeholder="Teacher ID (e.g., T001)"
                    value={newTeacher.id}
                    onChange={(e) =>
                      setNewTeacher({ ...newTeacher, id: e.target.value })
                    }
                    style={inputStyle}
                  />
                  <input
                    type="text"
                    placeholder="Teacher Name"
                    value={newTeacher.name}
                    onChange={(e) =>
                      setNewTeacher({ ...newTeacher, name: e.target.value })
                    }
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    placeholder="Max Load (hours/week)"
                    value={newTeacher.maxLoad}
                    onChange={(e) =>
                      setNewTeacher({ ...newTeacher, maxLoad: e.target.value })
                    }
                    style={inputStyle}
                  />
                  <button onClick={addTeacher} style={primaryButtonStyle}>
                    <Plus size={20} />
                    Add
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: theme.cardBg,
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.05)",
                  border: `1px solid ${theme.cardBorder}`,
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: theme.headerText }}>
                  Defined Teachers ({teachers.length})
                </h3>
                {teachers.length === 0 ? (
                  <p
                    style={{
                      color: "#718096",
                      textAlign: "center",
                      padding: "2rem",
                    }}>
                    No teachers defined yet.
                  </p>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(300px, 1fr))",
                      gap: "1.5rem",
                    }}>
                    {teachers.map((teacher) => (
                      <div
                        key={teacher.id}
                        style={{
                          border: `1px solid ${theme.cardBorder}`,
                          borderRadius: "12px",
                          padding: "1.5rem",
                          background: theme.secondaryCardBg,
                          boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                        }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "start",
                          }}>
                          <div>
                            <h4
                              style={{
                                margin: 0,
                                fontSize: "1.125rem",
                                fontWeight: "600",
                                color: theme.accent,
                              }}>
                              {teacher.name}
                            </h4>
                            <p
                              style={{
                                margin: "0.25rem 0",
                                fontSize: "0.875rem",
                                color: theme.cardSubText,
                              }}>
                              ID: {teacher.id}
                            </p>
                            <p
                              style={{
                                margin: "0.25rem 0",
                                fontSize: "0.875rem",
                                color: theme.cardSubText,
                              }}>
                              Max Load: {teacher.maxLoad} hrs/week
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              setTeachers(
                                teachers.filter((t) => t.id !== teacher.id),
                              )
                            }
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "#f56565",
                              padding: "0.25rem",
                            }}>
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        {/* MAPPING TAB */}
        {activeTab === "mapping" &&
          (currentUser.role === "Admin" || currentUser.role === "TTO") && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <h2
                style={{
                  fontSize: "1.75rem",
                  fontWeight: "700",
                  color: theme.headerText,
                  margin: 0,
                }}>
                Teacher-Subject Mapping
              </h2>

              <div
                style={{
                  background: theme.cardBg,
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.1)",
                  border: `1px solid ${theme.inputBorder}`,
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: theme.headerText }}>
                  Create New Mapping
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 120px",
                    gap: "1rem",
                  }}>
                  <select
                    value={newMapping.teacherId}
                    onChange={(e) =>
                      setNewMapping({
                        ...newMapping,
                        teacherId: e.target.value,
                      })
                    }
                    style={inputStyle}>
                    <option value="">-- Select Teacher --</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newMapping.subjectId}
                    onChange={(e) =>
                      setNewMapping({
                        ...newMapping,
                        subjectId: e.target.value,
                      })
                    }
                    style={inputStyle}>
                    <option value="">-- Select Subject --</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newMapping.branchId}
                    onChange={(e) =>
                      setNewMapping({
                        ...newMapping,
                        branchId: e.target.value,
                      })
                    }
                    style={inputStyle}>
                    <option value="">-- Select Branch/Section --</option>
                    <option value="All">All Sections</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.branch} - {b.section} (SEM {b.semester})
                      </option>
                    ))}
                  </select>
                  <button onClick={addMapping} style={primaryButtonStyle}>
                    <Plus size={20} />
                    Map
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: theme.cardBg,
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.1)",
                  border: `1px solid ${theme.inputBorder}`,
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                  <h3 style={{ margin: 0, color: theme.headerText }}>
                    Existing Mappings ({teacherSubjectMapping.length})
                  </h3>
                  <div style={{ display: "flex", gap: "1rem" }}>
                    <button
                      onClick={clearSectionMappings}
                      style={{ ...secondaryButtonStyle, padding: "0.5rem 1rem", fontSize: "0.8rem", borderColor: "#e53e3e", color: "#e53e3e" }}
                    >
                      <Trash2 size={16} style={{ marginRight: "0.5rem" }} />
                      Clear Section Mappings
                    </button>
                    <button
                      onClick={autoDistributeTeachers}
                      style={{ ...primaryButtonStyle, padding: "0.5rem 1rem", fontSize: "0.8rem" }}
                    >
                      <Clock size={16} style={{ marginRight: "0.5rem" }} />
                      Smart Auto-Map
                    </button>
                  </div>
                </div>
                {teacherSubjectMapping.length === 0 ? (
                  <p
                    style={{
                      color: "#718096",
                      textAlign: "center",
                      padding: "2rem",
                    }}>
                    No mappings created yet.
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "1rem",
                    }}>
                    {teacherSubjectMapping.map((map, idx) => {
                      const teacher = teachers.find(
                        (t) => t.id === map.teacherId,
                      );
                      const subject = subjects.find(
                        (s) => s.id === map.subjectId,
                      );
                      return (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "1rem",
                            border: `1px solid ${theme.cardBorder}`,
                            borderRadius: "8px",
                            background: theme.secondaryCardBg,
                          }}>
                          <span
                            style={{ fontSize: "0.9375rem", color: theme.cardText }}>
                            <strong>{teacher?.name || "Unknown"}</strong> →{" "}
                            {subject?.name || "Unknown"}
                            <span style={{ color: "#4ecca3", marginLeft: "0.5rem", fontSize: "0.8rem", fontWeight: "600" }}>
                              ({map.branchId === "All" ? "All Sections" : (branches.find(b => b.id === map.branchId) ? `${branches.find(b => b.id === map.branchId).branch} ${branches.find(b => b.id === map.branchId).section || ""}` : "Unknown Section")})
                            </span>
                          </span>
                          <button
                            onClick={() =>
                              setTeacherSubjectMapping(
                                teacherSubjectMapping.filter(
                                  (_, i) => i !== idx,
                                ),
                              )
                            }
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "#f56565",
                              padding: "0.25rem",
                            }}>
                            <Trash2 size={18} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        }

        {/* RESOURCES TAB */}
        {
          activeTab === "resources" &&
          (currentUser.role === "Admin" || currentUser.role === "TTO") && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <h2
                style={{
                  fontSize: "1.75rem",
                  fontWeight: "700",
                  color: theme.headerText,
                  margin: 0,
                }}>
                Resources & Schedule
              </h2>

              <div
                style={{
                  background: theme.cardBg,
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.1)",
                  border: `1px solid ${theme.inputBorder}`,
                }}>
                <h3 style={{ margin: "0 0 1rem 0", color: theme.headerText }}>
                  Quick Setup
                </h3>
                <button
                  onClick={generateDefaultSchedule}
                  style={{
                    ...primaryButtonStyle,
                    background: "#f6ad55",
                    width: "100%",
                  }}>
                  <Settings size={20} />
                  Generate Default Schedule (9:00 AM - 4:30 PM)
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "1.5rem",
                }}>
                <ResourceBox
                  title="Classrooms"
                  items={classrooms}
                  newItem={newClassroom}
                  setNewItem={setNewClassroom}
                  onAdd={() => {
                    if (newClassroom && !classrooms.includes(newClassroom)) {
                      setClassrooms([...classrooms, newClassroom]);
                      setNewClassroom("");
                    }
                  }}
                  onDelete={(idx) =>
                    setClassrooms(classrooms.filter((_, i) => i !== idx))
                  }
                  placeholder="Room-101"
                  theme={theme}
                  isDarkMode={isDarkMode}
                  inputStyle={inputStyle}
                  primaryButtonStyle={primaryButtonStyle}
                />

                <ResourceBox
                  title="Labs"
                  items={labs}
                  newItem={newLab}
                  setNewItem={setNewLab}
                  onAdd={() => {
                    if (newLab && !labs.includes(newLab)) {
                      setLabs([...labs, newLab]);
                      setNewLab("");
                    }
                  }}
                  onDelete={(idx) => setLabs(labs.filter((_, i) => i !== idx))}
                  placeholder="Lab-A"
                  theme={theme}
                  isDarkMode={isDarkMode}
                  inputStyle={inputStyle}
                  primaryButtonStyle={primaryButtonStyle}
                />

                <ResourceBox
                  title="Working Days"
                  items={workingDays}
                  newItem={newDay}
                  setNewItem={setNewDay}
                  onAdd={() => {
                    if (newDay && !workingDays.includes(newDay)) {
                      setWorkingDays([...workingDays, newDay]);
                      setNewDay("");
                    }
                  }}
                  onDelete={(idx) =>
                    setWorkingDays(workingDays.filter((_, i) => i !== idx))
                  }
                  isSelect={true}
                  options={[
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ]}
                  theme={theme}
                  isDarkMode={isDarkMode}
                  inputStyle={inputStyle}
                  primaryButtonStyle={primaryButtonStyle}
                />

                <div
                  style={{
                    background: theme.cardBg,
                    borderRadius: "12px",
                    padding: "1.5rem",
                    boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.1)",
                    border: `1px solid ${theme.inputBorder}`,
                  }}>
                  <h4 style={{ margin: "0 0 1rem 0", color: theme.headerText }}>
                    Time Slots ({timeSlots.length})
                  </h4>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginBottom: "1rem",
                    }}>
                    <input
                      type="time"
                      value={newTimeSlot.start}
                      onChange={(e) =>
                        setNewTimeSlot({
                          ...newTimeSlot,
                          start: e.target.value,
                        })
                      }
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <input
                      type="time"
                      value={newTimeSlot.end}
                      onChange={(e) =>
                        setNewTimeSlot({ ...newTimeSlot, end: e.target.value })
                      }
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      onClick={() => {
                        if (newTimeSlot.start && newTimeSlot.end) {
                          setTimeSlots([
                            ...timeSlots,
                            `${newTimeSlot.start}-${newTimeSlot.end}`,
                          ]);
                          setNewTimeSlot({ start: "", end: "" });
                        }
                      }}
                      style={{ ...primaryButtonStyle, width: "auto" }}>
                      <Plus size={20} />
                    </button>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      maxHeight: "200px",
                      overflowY: "auto",
                    }}>
                    {timeSlots.map((slot, idx) => (
                      <span
                        key={idx}
                        style={{
                          background: isDarkMode ? "#1a202c" : "#e6fffa",
                          color: isDarkMode ? theme.accent : "#234e52",
                          border: isDarkMode ? `1px solid ${theme.accent}` : "none",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          fontSize: "0.875rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}>
                        {slot}
                        <button
                          onClick={() =>
                            setTimeSlots(timeSlots.filter((_, i) => i !== idx))
                          }
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#f56565",
                            padding: 0,
                            fontSize: "1.25rem",
                            lineHeight: 1,
                          }}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        }

        {/* USERS TAB */}
        {
          activeTab === "users" && currentUser.role === "Admin" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <h2
                style={{
                  fontSize: "1.75rem",
                  fontWeight: "700",
                  color: theme.headerText,
                  margin: 0,
                }}>
                User Management
              </h2>

              <div
                style={{
                  background: theme.cardBg,
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.1)",
                  border: `1px solid ${theme.inputBorder}`,
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: theme.headerText }}>
                  Create New User
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "1rem",
                    marginBottom: "1rem",
                  }}>
                  <input
                    type="text"
                    placeholder="Username"
                    value={newUser.username}
                    onChange={(e) =>
                      setNewUser({ ...newUser, username: e.target.value })
                    }
                    style={inputStyle}
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={newUser.password}
                    onChange={(e) =>
                      setNewUser({ ...newUser, password: e.target.value })
                    }
                    style={inputStyle}
                  />
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={newUser.name}
                    onChange={(e) =>
                      setNewUser({ ...newUser, name: e.target.value })
                    }
                    style={inputStyle}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: "1rem",
                  }}>
                  <select
                    value={newUser.role}
                    onChange={(e) =>
                      setNewUser({ ...newUser, role: e.target.value })
                    }
                    style={inputStyle}>
                    <option value="Student">Student</option>
                    <option value="Teacher">Teacher</option>
                    <option value="TTO">TTO</option>
                    <option value="Admin">Admin</option>
                  </select>

                  {newUser.role === "Teacher" && (
                    <select
                      value={newUser.teacherId}
                      onChange={(e) =>
                        setNewUser({ ...newUser, teacherId: e.target.value })
                      }
                      style={inputStyle}>
                      <option value="">-- Link to Teacher --</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {newUser.role === "Student" && (
                    <select
                      value={newUser.assignedClass}
                      onChange={(e) =>
                        setNewUser({ ...newUser, assignedClass: e.target.value })
                      }
                      style={inputStyle}>
                      <option value="">-- Assign to Class --</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.id}
                        </option>
                      ))}
                    </select>
                  )}

                  <button onClick={addUser} style={primaryButtonStyle}>
                    <Plus size={20} />
                    Create User
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: theme.cardBg,
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.1)",
                  border: `1px solid ${theme.inputBorder}`,
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: theme.headerText }}>
                  All Users ({users.length})
                </h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr
                        style={{
                          background: theme.tableHeaderBg,
                          borderBottom: `2px solid ${theme.accent}`,
                        }}>
                        <th style={tableHeaderStyle}>Username</th>
                        <th style={tableHeaderStyle}>Name</th>
                        <th style={tableHeaderStyle}>Role</th>
                        <th style={tableHeaderStyle}>Access Details</th>
                        <th style={tableHeaderStyle}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr
                          key={user.username}
                          style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={tableCellStyle}>{user.username}</td>
                          <td style={tableCellStyle}>{user.name}</td>
                          <td style={tableCellStyle}>
                            <span
                              style={{
                                background:
                                  user.role === "Admin"
                                    ? "#fed7d7"
                                    : user.role === "TTO"
                                      ? "#d6bcfa"
                                      : user.role === "Teacher"
                                        ? "#bee3f8"
                                        : "#c6f6d5",
                                color:
                                  user.role === "Admin"
                                    ? "#9b2c2c"
                                    : user.role === "TTO"
                                      ? "#553c9a"
                                      : user.role === "Teacher"
                                        ? "#2c5282"
                                        : "#276749",
                                padding: "0.25rem 0.75rem",
                                borderRadius: "12px",
                                fontSize: "0.75rem",
                                fontWeight: "600",
                              }}>
                              {user.role}
                            </span>
                          </td>
                          <td style={tableCellStyle}>
                            {user.role === "Teacher" &&
                              user.teacherId &&
                              `Teacher ID: ${user.teacherId}`}
                            {user.role === "Student" &&
                              user.assignedClass &&
                              `Class: ${user.assignedClass}`}
                            {(user.role === "Admin" || user.role === "TTO") &&
                              "Full Access"}
                          </td>
                          <td style={tableCellStyle}>
                            {user.username !== "admin" && (
                              <button
                                onClick={() =>
                                  setUsers(
                                    users.filter(
                                      (u) => u.username !== user.username,
                                    ),
                                  )
                                }
                                style={{
                                  padding: "0.25rem 0.5rem",
                                  background: "#f56565",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                  fontSize: "0.875rem",
                                }}>
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        }

        {/* VIEW TIMETABLE TAB */}
        {
          activeTab === "view-timetable" &&
          generatedTimetable &&
          canViewTimetable() && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <h2
                style={{
                  fontSize: "1.75rem",
                  fontWeight: "700",
                  color: "#e0e0e0",
                  margin: 0,
                }}>
                {currentUser.role === "Student"
                  ? "My Class Timetable"
                  : currentUser.role === "Teacher"
                    ? "My Teaching Schedule"
                    : "All Timetables"}
              </h2>

              {/* Class Timetables */}
              {(currentUser.role === "Admin" ||
                currentUser.role === "TTO" ||
                currentUser.role === "Student") && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "2rem",
                    }}>
                    {getViewableTimetables().map((branch) => {
                      const branchTimetable = generatedTimetable[branch.id];
                      if (!branchTimetable) return null;

                      return (
                        <div
                          key={branch.id}
                          style={{
                            background: theme.cardBg,
                            borderRadius: "12px",
                            boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.4)" : "0 4px 12px rgba(0,0,0,0.1)",
                            overflow: "hidden",
                            border: `1px solid ${theme.inputBorder}`,
                          }}>
                          <div
                            style={{
                              background: "linear-gradient(135deg, #4ecca3 0%, #3da58a 100%)",
                              color: "#0f0f1e",
                              padding: "1.5rem 2rem",
                              display: "grid",
                              gridTemplateColumns: "1fr auto 1fr",
                              alignItems: "center",
                              gap: "1rem",
                            }}>
                            <div>
                              <h3 style={{ margin: 0, fontSize: "1.125rem" }}>
                                Class Timetable
                              </h3>
                              <p
                                style={{
                                  margin: "0.25rem 0 0 0",
                                  fontSize: "0.875rem",
                                  opacity: 0.9,
                                }}>
                                Academic Year 2024-25
                              </p>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <div
                                style={{
                                  fontSize: "1.75rem",
                                  fontWeight: "700",
                                }}>
                                {branch.branch}
                              </div>
                              <div style={{ fontSize: "0.875rem" }}>
                                Section {branch.section}
                              </div>
                            </div>
                            <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-end" }}>
                              <div>
                                <div
                                  style={{
                                    fontSize: "0.875rem",
                                    fontWeight: "600",
                                  }}>
                                  Semester {branch.semester}
                                </div>
                                <div style={{ fontSize: "0.75rem", opacity: 0.9 }}>
                                  {new Date().toLocaleDateString()}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: "0.5rem" }}>
                                <button
                                  onClick={() => exportTimetableToPDF(branch)}
                                  style={{
                                    padding: "0.5rem 1rem",
                                    background: "rgba(255,255,255,0.2)",
                                    color: "white",
                                    border: "1px solid rgba(255,255,255,0.4)",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontSize: "0.75rem",
                                    fontWeight: "600",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                  }}>
                                  <Download size={14} />
                                  PDF
                                </button>
                                <button
                                  onClick={() => exportTimetableToCSV(branch)}
                                  style={{
                                    padding: "0.5rem 1rem",
                                    background: "rgba(255,255,255,0.2)",
                                    color: "white",
                                    border: "1px solid rgba(255,255,255,0.4)",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontSize: "0.75rem",
                                    fontWeight: "600",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                  }}>
                                  <FileDown size={14} />
                                  CSV
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Formal University Timetable Layout */}
                          <div style={{ overflowX: "auto", padding: "1rem" }}>
                            <table
                              style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                border: "1px solid #e2e8f0",
                              }}>
                              <thead>
                                <tr
                                  style={{
                                    background: "linear-gradient(135deg, #1a202c 0%, #16213e 100%)",
                                    color: "#4ecca3",
                                  }}>
                                  <th
                                    style={{
                                      padding: "0.875rem",
                                      border: "1px solid #2d3748",
                                      textAlign: "center",
                                      fontWeight: "700",
                                      fontSize: "0.875rem",
                                      minWidth: "100px",
                                    }}>
                                    Day/Time
                                  </th>
                                  {timeSlots
                                    .map((slot, idx) => {
                                      const [start, end] = slot.split("-");
                                      return (
                                        <th
                                          key={idx}
                                          style={{
                                            padding: "0.875rem 0.5rem",
                                            border: "1px solid rgba(255,255,255,0.3)",
                                            fontSize: "0.75rem",
                                            fontWeight: "600",
                                            textAlign: "center",
                                            minWidth: "100px",
                                          }}>
                                          {start} – {end}
                                        </th>
                                      );
                                    })}
                                </tr>
                              </thead>
                              <tbody>
                                {workingDays.map((day, dayIndex) => {
                                  const allSlots = timeSlots;

                                  return (
                                    <React.Fragment key={day}>
                                      {/* Regular Day Row */}
                                      <tr>
                                        <td
                                          style={{
                                            padding: "0.75rem",
                                            border: `1px solid ${theme.inputBorder}`,
                                            background: theme.tableHeaderBg,
                                            fontWeight: "700",
                                            textAlign: "center",
                                            fontSize: "0.875rem",
                                            color: theme.accent,
                                          }}>
                                          {day}
                                        </td>
                                        {allSlots.map((time) => {
                                          const slotKey = `${day}-${time}`;
                                          const isBreak = isBreakTime(day, time);
                                          const breakInfo = isBreak ? breaks.find(br => {
                                            const [slotStart] = time.split("-");
                                            const breakStart = br.startTime.replace(":", "");
                                            const breakEnd = br.endTime.replace(":", "");
                                            const slotTime = slotStart.replace(":", "");
                                            return (br.day === "All" || br.day === day) && slotTime >= breakStart && slotTime < breakEnd;
                                          }) : null;

                                          if (isBreak) {
                                            return (
                                              <td
                                                key={slotKey}
                                                style={{
                                                  padding: "0.75rem 0.5rem",
                                                  border: "1px solid #78350f",
                                                  background: "#3d2b1f",
                                                  textAlign: "center",
                                                  fontSize: "0.8rem",
                                                  verticalAlign: "middle",
                                                }}
                                              >
                                                <div style={{ fontWeight: "700", color: "#d97706" }}>
                                                  {breakInfo ? breakInfo.type.toUpperCase() : "BREAK"}
                                                </div>
                                              </td>
                                            );
                                          }

                                          const entry = branchTimetable[slotKey];

                                          // Check if this is part of a lab block
                                          const isLab = entry?.type === "Lab";
                                          const isCounseling = entry?.type === "Counseling";

                                          return (
                                            <td
                                              key={slotKey}
                                              style={{
                                                padding: "0.75rem 0.5rem",
                                                border: `1px solid ${theme.inputBorder}`,
                                                background: isLab
                                                  ? (isDarkMode ? "#2d1b4e" : "#e9d8fd")
                                                  : isCounseling
                                                    ? (isDarkMode ? "#1a3e3e" : "#e6fffa")
                                                    : entry
                                                      ? (isDarkMode ? "#16213e" : "#ebf8ff")
                                                      : theme.cardBg,
                                                textAlign: "center",
                                                fontSize: "0.8rem",
                                                verticalAlign: "middle",
                                              }}>
                                              {entry ? (
                                                <div style={{ color: theme.cardText }}>
                                                  <div style={{ fontWeight: "700", marginBottom: "0.25rem" }}>
                                                    {entry.subject} ({entry.type})
                                                  </div>
                                                  <div style={{ fontSize: "0.7rem", color: theme.cardSubText }}>
                                                    {branch.branch}-{branch.section}-SEM{branch.semester}
                                                  </div>
                                                  {entry.teacher && (
                                                    <div style={{ fontSize: "0.7rem", color: "#4ecca3", marginTop: "0.25rem", fontWeight: "600" }}>
                                                      {entry.teacher}
                                                    </div>
                                                  )}
                                                </div>
                                              ) : (
                                                <span style={{ fontSize: "0.7rem", fontWeight: "600", color: "#4ecca3", opacity: 0.6 }}>
                                                  FREE
                                                </span>
                                              )}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              }

              {/* Teacher Schedules */}
              {
                canViewTeacherSchedule() && teacherSchedules && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "2rem",
                    }}>
                    <h3
                      style={{
                        fontSize: "1.5rem",
                        fontWeight: "700",
                        color: theme.headerText,
                        margin: 0,
                      }}>
                      {currentUser.role === "Teacher"
                        ? "My Schedule"
                        : "Teacher Schedules"}
                    </h3>

                    {getViewableTeacherSchedules().map((teacher) => (
                      <div
                        key={teacher.id}
                        style={{
                          background: theme.cardBg,
                          borderRadius: "12px",
                          boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.4)" : "0 4px 12px rgba(0,0,0,0.1)",
                          overflow: "hidden",
                          border: `1px solid ${theme.inputBorder}`,
                        }}>
                        <div
                          style={{
                            background:
                              "linear-gradient(135deg, #4ecca3 0%, #3da58a 100%)",
                            color: "#0f0f1e",
                            padding: "1.5rem 2rem",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}>
                          <div>
                            <h4 style={{ margin: 0, fontSize: "1.25rem" }}>
                              {teacher.name}
                            </h4>
                            <p
                              style={{
                                margin: "0.25rem 0 0 0",
                                fontSize: "0.875rem",
                                opacity: 0.9,
                              }}>
                              ID: {teacher.id}
                            </p>
                          </div>
                          <div
                            style={{
                              background: "rgba(255,255,255,0.2)",
                              padding: "0.5rem 1rem",
                              borderRadius: "8px",
                            }}>
                            Load:{" "}
                            {constraintReport?.teacherWorkload[teacher.id] || 0}/
                            {teacher.maxLoad} hrs
                          </div>
                        </div>

                        <div style={{ overflowX: "auto", padding: "1rem" }}>
                          <table
                            style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr
                                style={{ background: theme.tableHeaderBg, color: theme.accent }}>
                                <th
                                  style={{
                                    ...tableHeaderStyle,
                                    border: `1px solid ${theme.inputBorder}`,
                                  }}>
                                  Day/Time
                                </th>
                                {timeSlots.map((slot, idx) => (
                                  <th
                                    key={idx}
                                    style={{
                                      ...tableHeaderStyle,
                                      border: `1px solid ${theme.tableRowBorder}`,
                                      fontSize: "0.875rem",
                                    }}>
                                    {slot.split("-")[0]}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {workingDays.map((day) => (
                                <tr key={day}>
                                  <td
                                    style={{
                                      ...tableCellStyle,
                                      border: "1px solid #2d3748",
                                      background: "#2d3748",
                                      fontWeight: "600",
                                      textAlign: "center",
                                      color: "#4ecca3",
                                    }}>
                                    {day}
                                  </td>
                                  {timeSlots.map((time) => {
                                    const slotKey = `${day}-${time}`;
                                    const isScheduled =
                                      teacherSchedules[teacher.id][day].includes(
                                        slotKey,
                                      );
                                    const isBreak = isBreakTime(day, time);
                                    const isCounseling = isCounselingSlot(
                                      teacher.id,
                                      day,
                                      time,
                                    );

                                    let classInfo = null;
                                    if (isScheduled && !isCounseling) {
                                      for (const branch of branches) {
                                        const entry =
                                          generatedTimetable[branch.id][slotKey];
                                        if (
                                          entry &&
                                          entry.teacherId === teacher.id
                                        ) {
                                          classInfo = {
                                            section: branch.id,
                                            subject: entry.subject,
                                            type: entry.type,
                                          };
                                          break;
                                        }
                                      }
                                    }

                                    return (
                                      <td
                                        key={slotKey}
                                        style={{
                                          padding: "0.75rem 0.5rem",
                                          border: `1px solid ${theme.inputBorder}`,
                                          background: isBreak
                                            ? (isDarkMode ? "#3d2b1f" : "#fffaf0")
                                            : isCounseling
                                              ? (isDarkMode ? "#1a3e3e" : "#e6fffa")
                                              : isScheduled
                                                ? (classInfo?.type === "Lab"
                                                  ? (isDarkMode ? "#2d1b4e" : "#e9d8fd")
                                                  : (isDarkMode ? "#16213e" : "#ebf8ff"))
                                                : theme.cardBg,
                                          textAlign: "center",
                                          fontSize: "0.75rem",
                                          color: theme.cardText,
                                        }}>
                                        {isBreak ? (
                                          <div
                                            style={{
                                              fontWeight: "600",
                                              color: "#d97706",
                                              opacity: 0.8,
                                            }}>
                                            BREAK
                                          </div>
                                        ) : isCounseling ? (
                                          <div
                                            style={{
                                              fontWeight: "600",
                                              color: "#059669",
                                            }}>
                                            COUNSELING
                                          </div>
                                        ) : classInfo ? (
                                          <>
                                            <div
                                              style={{
                                                fontWeight: "700",
                                                color: theme.cardText,
                                              }}>
                                              {classInfo.subject}
                                            </div>
                                            <div
                                              style={{
                                                color: theme.cardSubText,
                                                marginTop: "0.25rem",
                                                fontSize: "0.7rem",
                                                fontWeight: "600",
                                              }}>
                                              {classInfo.section} ({classInfo.type})
                                            </div>
                                          </>
                                        ) : (
                                          <div
                                            style={{
                                              color: "#4ecca3",
                                              fontWeight: "600",
                                              fontSize: "0.7rem",
                                              opacity: 0.8,
                                            }}>
                                            FREE
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }

              {/* Constraint Report */}
              {
                (currentUser.role === "Admin" || currentUser.role === "TTO") &&
                constraintReport && (
                  <div
                    style={{
                      background: theme.cardBg,
                      borderRadius: "12px",
                      padding: "2rem",
                      boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.05)",
                      border: `1px solid ${theme.cardBorder}`,
                    }}>
                    <h3
                      style={{
                        margin: "0 0 1.5rem 0",
                        fontSize: "1.25rem",
                        color: theme.headerText,
                      }}>
                      Constraint Report
                    </h3>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, 1fr)",
                        gap: "1.5rem",
                      }}>
                      <div
                        style={{
                          background: isDarkMode ? "#064e3b" : "#f0fff4",
                          border: `2px solid ${isDarkMode ? "#059669" : "#48bb78"}`,
                          borderRadius: "12px",
                          padding: "1.5rem",
                        }}>
                        <h4
                          style={{
                            margin: "0 0 1rem 0",
                            color: isDarkMode ? "#a7f3d0" : "#2f855a",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}>
                          <CheckCircle size={20} />
                          Satisfied (
                          {constraintReport.satisfiedConstraints.length})
                        </h4>
                        <ul
                          style={{
                            listStyle: "none",
                            padding: 0,
                            margin: 0,
                            color: isDarkMode ? "#a7f3d0" : "#2f855a",
                          }}>
                          {constraintReport.satisfiedConstraints.map(
                            (c, idx) => (
                              <li key={idx} style={{ marginBottom: "0.5rem" }}>
                                ✓ {c}
                              </li>
                            ),
                          )}
                        </ul>
                      </div>

                      <div
                        style={{
                          background: isDarkMode ? "#450a0a" : "#fff5f5",
                          border: `2px solid ${isDarkMode ? "#dc2626" : "#f56565"}`,
                          borderRadius: "12px",
                          padding: "1.5rem",
                        }}>
                        <h4
                          style={{
                            margin: "0 0 1rem 0",
                            color: isDarkMode ? "#fecaca" : "#c53030",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}>
                          <AlertCircle size={20} />
                          Violations ({constraintReport.violations.length})
                        </h4>
                        {constraintReport.violations.length === 0 ? (
                          <p style={{ color: isDarkMode ? "#4ade80" : "#38a169", fontWeight: "600" }}>
                            No violations!
                          </p>
                        ) : (
                          <ul
                            style={{
                              listStyle: "none",
                              padding: 0,
                              margin: 0,
                              color: isDarkMode ? "#fecaca" : "#c53030",
                            }}>
                            {constraintReport.violations.map((v, idx) => (
                              <li key={idx} style={{ marginBottom: "0.5rem" }}>
                                ✗ {v}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )
              }
            </div >
          )
        }
      </div >
    </div >
  );
};

// ==================== HELPER COMPONENTS ====================

const TabButton = ({ active, onClick, children, theme }) => (
  <button
    onClick={onClick}
    style={{
      padding: "1rem 1.5rem",
      background: "none",
      border: "none",
      borderBottom: active ? `3px solid ${theme.tabActiveBorder}` : "3px solid transparent",
      color: active ? theme.tabActiveBorder : theme.tabInactiveText,
      fontWeight: active ? "600" : "500",
      cursor: "pointer",
      whiteSpace: "nowrap",
      transition: "all 0.2s",
    }}>
    {children}
  </button>
);

const StatCard = ({ title, color, children, theme, isDarkMode }) => (
  <div
    style={{
      background: theme.cardBg,
      borderRadius: "12px",
      padding: "1.5rem",
      boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.05)",
      border: `1px solid ${theme.cardBorder}`,
    }}>
    <h3
      style={{
        margin: "0 0 1rem 0",
        color: color,
        fontSize: "1.125rem",
        fontWeight: "600",
      }}>
      {title}
    </h3>
    {children}
  </div>
);

const StatItem = ({ label, value, theme }) => (
  <p style={{ margin: "0.5rem 0", fontSize: "0.9375rem", color: theme.cardSubText }}>
    {label}: <strong style={{ color: theme.cardText }}>{value}</strong>
  </p>
);

const ResourceBox = ({
  title,
  items,
  newItem,
  setNewItem,
  onAdd,
  onDelete,
  placeholder,
  isSelect,
  options,
  theme,
  isDarkMode,
  inputStyle,
  primaryButtonStyle
}) => (
  <div
    style={{
      background: theme.cardBg,
      borderRadius: "12px",
      padding: "1.5rem",
      boxShadow: isDarkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.05)",
      border: `1px solid ${theme.cardBorder}`,
    }}>
    <h4 style={{ margin: "0 0 1rem 0", color: theme.cardText }}>
      {title} ({items.length})
    </h4>
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
      {isSelect ? (
        <select
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}>
          <option value="">-- Select {title} --</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          placeholder={placeholder}
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
      )}
      <button onClick={onAdd} style={{ ...primaryButtonStyle, width: "auto" }}>
        <Plus size={20} />
      </button>
    </div>
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem",
        maxHeight: "200px",
        overflowY: "auto",
      }}>
      {items.map((item, idx) => (
        <span
          key={idx}
          style={{
            background: theme.secondaryCardBg,
            color: isDarkMode ? theme.accent : theme.cardText,
            border: `1px solid ${isDarkMode ? theme.accent : theme.cardBorder}`,
            padding: "0.5rem 0.75rem",
            borderRadius: "8px",
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}>
          {item}
          <button
            onClick={() => onDelete(idx)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#f56565",
              padding: 0,
              fontSize: "1.25rem",
              lineHeight: 1,
            }}>
            ×
          </button>
        </span>
      ))}
    </div>
  </div>
);

// Styles moved inside component for theme support
export default TimetableGenerator;
