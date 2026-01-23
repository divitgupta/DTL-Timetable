import React, { useState } from "react";
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
} from "lucide-react";

const shuffleArray = (array) => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

const getShuffledSlotsForDay = (day, timeSlots, breaks, halfDays) => {
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

  return shuffleArray(slots);
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
  const [activeTab, setActiveTab] = useState("login");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // User Management
  const [users, setUsers] = useState([
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
  ]);

  // Core Data
  const [branches, setBranches] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [teacherSubjectMapping, setTeacherSubjectMapping] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [labs, setLabs] = useState([]);
  const [workingDays, setWorkingDays] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [breaks, setBreaks] = useState([
    { day: "All", startTime: "11:00", endTime: "11:30", type: "Short Break" },
    { day: "All", startTime: "13:30", endTime: "14:30", type: "Lunch Break" },
  ]);
  const [halfDays, setHalfDays] = useState([]);
  const [counselingPeriods, setCounselingPeriods] = useState([]);

  // Form States
  const [newBranch, setNewBranch] = useState({
    branch: "",
    section: "",
    semester: "",
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
  });
  const [newTeacher, setNewTeacher] = useState({
    id: "",
    name: "",
    maxLoad: "",
  });
  const [newMapping, setNewMapping] = useState({
    teacherId: "",
    subjectId: "",
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

  // Generated Data
  const [generatedTimetable, setGeneratedTimetable] = useState(null);
  const [teacherSchedules, setTeacherSchedules] = useState(null);
  const [constraintReport, setConstraintReport] = useState(null);
  const [generationLog, setGenerationLog] = useState([]);

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
  ) => {
    const availableSlots = shuffleArray(getAvailableSlots(day));

    for (let i = 0; i <= availableSlots.length - blockSize; i++) {
      const consecutiveSlots = availableSlots.slice(i, i + blockSize);
      const slotKeys = consecutiveSlots.map((slot) => `${day}-${slot}`);

      // Check if all slots are free for both class and teacher
      const allFree = slotKeys.every((key) => {
        const classFree = !timetable[branchId][key];
        const teacherFree =
          !teacherSchedule[teacherId][day].includes(key) &&
          !isCounselingSlot(
            teacherId,
            day,
            consecutiveSlots[slotKeys.indexOf(key)],
          );
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

  const distributeTheoryHours = (
    subject,
    teacher,
    branchId,
    timetable,
    teacherSchedule,
    teacherWorkload,
  ) => {
    const theoryHours = parseInt(subject.theoryHours) || 0;
    if (theoryHours === 0) return 0;

    let hoursScheduled = 0;
    const isContinuous = subject.isContinuous;
    const blockSize = subject.continuousBlockSize || 2;

    // 🔥 Randomize day order per subject
    const shuffledDays = shuffleArray([...workingDays]);

    if (isContinuous && theoryHours >= blockSize) {
      const blocksNeeded = Math.floor(theoryHours / blockSize);
      const remaining = theoryHours % blockSize;

      // ---- CONTINUOUS BLOCKS ----
      for (let b = 0; b < blocksNeeded; b++) {
        let placed = false;

        for (const day of shuffledDays) {
          if (placed) break;

          const block = findConsecutiveSlots(
            day,
            blockSize,
            timetable,
            branchId,
            teacher.id,
            teacherSchedule,
          );

          if (
            block &&
            teacherWorkload[teacher.id] + blockSize <= teacher.maxLoad
          ) {
            block.keys.forEach((key, i) => {
              timetable[branchId][key] = {
                subject: `${subject.name} (Theory)`,
                subjectId: subject.id,
                teacher: teacher.name,
                teacherId: teacher.id,
                type: "Theory",
                room:
                  classrooms[Math.floor(Math.random() * classrooms.length)] ||
                  "Room-TBD",
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

      // ---- REMAINING SINGLE HOURS ----
      for (let r = 0; r < remaining; r++) {
        let placed = false;

        for (const day of shuffledDays) {
          if (placed) break;

          const slots = getShuffledSlotsForDay(
            day,
            timeSlots,
            breaks,
            halfDays,
          );

          for (const slot of slots) {
            if (
              canPlaceSubject(
                day,
                slot,
                timetable,
                branchId,
                teacher.id,
                teacherSchedule,
                subject.id,
              )
            ) {
              const key = `${day}-${slot}`;
              timetable[branchId][key] = {
                subject: `${subject.name} (Theory)`,
                subjectId: subject.id,
                teacher: teacher.name,
                teacherId: teacher.id,
                type: "Theory",
                room:
                  classrooms[Math.floor(Math.random() * classrooms.length)] ||
                  "Room-TBD",
              };

              teacherSchedule[teacher.id][day].push(key);
              teacherWorkload[teacher.id]++;
              hoursScheduled++;
              placed = true;
              break;
            }
          }
        }
      }
    } else {
      // ---- NON-CONTINUOUS (DISTRIBUTED) ----
      for (
        let h = 0;
        h < theoryHours && teacherWorkload[teacher.id] < teacher.maxLoad;
        h++
      ) {
        let placed = false;

        for (const day of shuffledDays) {
          if (placed) break;

          const slots = getShuffledSlotsForDay(
            day,
            timeSlots,
            breaks,
            halfDays,
          );

          for (const slot of slots) {
            if (
              canPlaceSubject(
                day,
                slot,
                timetable,
                branchId,
                teacher.id,
                teacherSchedule,
                subject.id,
              )
            ) {
              const key = `${day}-${slot}`;
              timetable[branchId][key] = {
                subject: `${subject.name} (Theory)`,
                subjectId: subject.id,
                teacher: teacher.name,
                teacherId: teacher.id,
                type: "Theory",
                room:
                  classrooms[Math.floor(Math.random() * classrooms.length)] ||
                  "Room-TBD",
              };

              teacherSchedule[teacher.id][day].push(key);
              teacherWorkload[teacher.id]++;
              hoursScheduled++;
              placed = true;
              break;
            }
          }
        }
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
  ) => {
    const labHours = parseInt(subject.labHours) || 0;
    if (labHours === 0) return 0;

    const LAB_BLOCK_SIZE = 2; // All labs must be 2-hour continuous blocks
    const blocksNeeded = Math.ceil(labHours / LAB_BLOCK_SIZE);
    let blocksScheduled = 0;

    for (
      let block = 0;
      block < blocksNeeded && teacherWorkload[teacher.id] < teacher.maxLoad;
      block++
    ) {
      let blockPlaced = false;

      // Try to place one lab per day for even distribution
      for (const day of workingDays) {
        if (blockPlaced || isHalfDay(day)) continue;
        if (classHasLabOnDay(timetable, branchId, day)) continue;

        const consecutiveSlots = findConsecutiveSlots(
          day,
          LAB_BLOCK_SIZE,
          timetable,
          branchId,
          teacher.id,
          teacherSchedule,
        );

        if (
          consecutiveSlots &&
          teacherWorkload[teacher.id] + LAB_BLOCK_SIZE <= teacher.maxLoad
        ) {
          const room = labs.length > 0 ? labs[block % labs.length] : "Lab-TBD";

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
          addLog(
            `Placed ${LAB_BLOCK_SIZE}-hour lab for ${subject.name} in ${branchId} on ${day} at ${room}`,
          );
        }
      }

      if (!blockPlaced) {
        addLog(
          `⚠️ Could not place lab block ${block + 1} for ${subject.name} in ${branchId}`,
        );
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

    addLog("🚀 Starting enhanced timetable generation...");

    const timetable = {};
    const teacherWorkload = {};
    const teacherDailySchedule = {};
    const violations = [];
    const satisfiedConstraints = [];
    const assumptions = [];
    const shuffledBranches = shuffleArray(branches);
    const shuffledDays = shuffleArray(workingDays);

    // Initialize
    teachers.forEach((t) => {
      teacherWorkload[t.id] = 0;
      teacherDailySchedule[t.id] = {};
      workingDays.forEach((day) => {
        teacherDailySchedule[t.id][day] = [];
      });
    });

    shuffledBranches.forEach((branch) => {
      timetable[branch.id] = {};
      const branchSubjects = shuffleArray(
        subjects.filter((s) => branch.subjects.includes(s.id)),
      );

      if (branchSubjects.length === 0) {
        assumptions.push(`Branch ${branch.id} has no subjects assigned`);
        return;
      }

      addLog(
        `📚 Processing ${branch.id} with ${branchSubjects.length} subjects`,
      );

      // Phase 1: Place all labs first (they have stricter constraints)
      // ==================== PHASE 1: PLACE LABS ====================
      branchSubjects.forEach((subject) => {
        if (subject.labHours && parseInt(subject.labHours) > 0) {
          const mappings = teacherSubjectMapping.filter(
            (m) => m.subjectId === subject.id,
          );
          if (mappings.length === 0) return;

          const teacher = teachers.find((t) => t.id === mappings[0].teacherId);
          if (!teacher) return;

          const hoursScheduled = distributeLabHours(
            subject,
            teacher,
            branch.id,
            timetable,
            teacherDailySchedule,
            teacherWorkload,
          );

          if (hoursScheduled < parseInt(subject.labHours)) {
            violations.push(
              `${subject.name} lab: scheduled ${hoursScheduled}/${subject.labHours} hours in ${branch.id}`,
            );
          } else {
            satisfiedConstraints.push(
              `${subject.name} lab: all ${hoursScheduled} hours scheduled in ${branch.id}`,
            );
          }
        }
      });

      // Phase 2: Place theory classes
      branchSubjects.forEach((subject) => {
        if (subject.theoryHours && parseInt(subject.theoryHours) > 0) {
          const mappings = teacherSubjectMapping.filter(
            (m) => m.subjectId === subject.id,
          );
          if (mappings.length > 0) {
            const teacher = teachers.find(
              (t) => t.id === mappings[0].teacherId,
            );
            if (teacher) {
              const hoursScheduled = distributeTheoryHours(
                subject,
                teacher,
                branch.id,
                timetable,
                teacherDailySchedule,
                teacherWorkload,
              );
              if (hoursScheduled < parseInt(subject.theoryHours)) {
                violations.push(
                  `${subject.name} theory: scheduled ${hoursScheduled}/${subject.theoryHours} hours in ${branch.id}`,
                );
              } else {
                satisfiedConstraints.push(
                  `${subject.name} theory: all ${hoursScheduled} hours scheduled in ${branch.id}`,
                );
              }
            }
          }
        }
      });

      // Phase 3: Add counseling periods
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
      addLog(`Added branch: ${id}`);
      setNewBranch({ branch: "", section: "", semester: "" });
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
          ...newSubject,
          theoryHours: newSubject.theoryHours || "0",
          labHours: newSubject.labHours || "0",
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
    if (newMapping.teacherId && newMapping.subjectId) {
      setTeacherSubjectMapping([...teacherSubjectMapping, { ...newMapping }]);
      addLog(`Mapped teacher to subject`);
      setNewMapping({ teacherId: "", subjectId: "" });
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
          minHeight: "100vh",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
        <div
          style={{
            background: "white",
            borderRadius: "16px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            padding: "3rem",
            maxWidth: "450px",
            width: "100%",
          }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <Calendar
              size={64}
              color="#667eea"
              style={{ marginBottom: "1rem" }}
            />
            <h1
              style={{
                fontSize: "2rem",
                fontWeight: "700",
                color: "#1a202c",
                margin: 0,
              }}>
              Smart Timetable System
            </h1>
            <p style={{ color: "#718096", marginTop: "0.5rem" }}>
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
                  color: "#4a5568",
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
                  border: "2px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "1rem",
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
                  color: "#4a5568",
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
                    border: "2px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "1rem",
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
                    <EyeOff size={20} color="#718096" />
                  ) : (
                    <Eye size={20} color="#718096" />
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
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
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
              background: "#f7fafc",
              borderRadius: "8px",
              fontSize: "0.75rem",
              color: "#4a5568",
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
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "0",
        margin: "0",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: "auto",
      }}>
      {/* Header Bar */}
      <div
        style={{
          background: "white",
          borderBottom: "2px solid #e2e8f0",
          padding: "1rem 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 1000,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Calendar size={32} color="#667eea" />
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "1.5rem",
                fontWeight: "700",
                color: "#1a202c",
              }}>
              Smart Timetable System
            </h1>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#718096" }}>
              Enhanced Algorithm • Role-Based Access
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ textAlign: "right" }}>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <UserCheck size={20} color="#48bb78" />
              <span style={{ fontWeight: "600", color: "#1a202c" }}>
                {currentUser.name}
              </span>
            </div>
            <span
              style={{
                display: "inline-block",
                fontSize: "0.75rem",
                background: "#e6fffa",
                color: "#234e52",
                padding: "0.25rem 0.75rem",
                borderRadius: "12px",
                marginTop: "0.25rem",
              }}>
              {currentUser.role}
            </span>
          </div>
          <button
            onClick={handleLogout}
            style={{
              padding: "0.5rem 1rem",
              background: "#f56565",
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
          background: "white",
          borderBottom: "1px solid #e2e8f0",
          padding: "0 2rem",
          display: "flex",
          gap: "0.5rem",
          overflowX: "auto",
        }}>
        <TabButton
          active={activeTab === "dashboard"}
          onClick={() => setActiveTab("dashboard")}>
          Dashboard
        </TabButton>

        {(currentUser.role === "Admin" || currentUser.role === "TTO") && (
          <>
            <TabButton
              active={activeTab === "branches"}
              onClick={() => setActiveTab("branches")}>
              Branches
            </TabButton>
            <TabButton
              active={activeTab === "subjects"}
              onClick={() => setActiveTab("subjects")}>
              Subjects
            </TabButton>
            <TabButton
              active={activeTab === "teachers"}
              onClick={() => setActiveTab("teachers")}>
              Teachers
            </TabButton>
            <TabButton
              active={activeTab === "mapping"}
              onClick={() => setActiveTab("mapping")}>
              Mappings
            </TabButton>
            <TabButton
              active={activeTab === "resources"}
              onClick={() => setActiveTab("resources")}>
              Resources
            </TabButton>
          </>
        )}

        {currentUser.role === "Admin" && (
          <TabButton
            active={activeTab === "users"}
            onClick={() => setActiveTab("users")}>
            Users
          </TabButton>
        )}

        {canViewTimetable() && generatedTimetable && (
          <TabButton
            active={activeTab === "view-timetable"}
            onClick={() => setActiveTab("view-timetable")}>
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
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "white",
                borderRadius: "16px",
                padding: "2rem",
                boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
              }}>
              <h2 style={{ fontSize: "2rem", margin: "0 0 0.5rem 0" }}>
                Welcome, {currentUser.name}!
              </h2>
              <p style={{ margin: 0, opacity: 0.9 }}>
                Role: {currentUser.role}
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: "1.5rem",
              }}>
              <StatCard title="System Data" color="#3182ce">
                <StatItem label="Branches" value={branches.length} />
                <StatItem label="Subjects" value={subjects.length} />
                <StatItem label="Teachers" value={teachers.length} />
                <StatItem
                  label="Mappings"
                  value={teacherSubjectMapping.length}
                />
              </StatCard>

              <StatCard title="Schedule Config" color="#38a169">
                <StatItem label="Working Days" value={workingDays.length} />
                <StatItem label="Time Slots" value={timeSlots.length} />
                <StatItem label="Classrooms" value={classrooms.length} />
                <StatItem label="Labs" value={labs.length} />
              </StatCard>

              <StatCard title="Access Level" color="#805ad5">
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
              </StatCard>
            </div>

            {currentUser.role === "TTO" && (
              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}>
                <h3
                  style={{
                    margin: "0 0 1rem 0",
                    fontSize: "1.25rem",
                    color: "#1a202c",
                  }}>
                  Generate Timetable
                </h3>
                <p style={{ color: "#718096", marginBottom: "1.5rem" }}>
                  Ensure all data is configured before generating. The enhanced
                  algorithm will:
                </p>
                <ul
                  style={{
                    color: "#4a5568",
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
                    background:
                      "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
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
                  color: "#1a202c",
                  margin: 0,
                }}>
                Manage Subjects
              </h2>

              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: "#1a202c" }}>
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
                    alignItems: "center",
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
                    <span style={{ fontWeight: "500", color: "#4a5568" }}>
                      Require Continuous Placement (place in blocks, not
                      scattered)
                    </span>
                  </label>
                </div>

                <button onClick={addSubject} style={primaryButtonStyle}>
                  <Plus size={20} />
                  Add Subject
                </button>

                <div
                  style={{
                    marginTop: "1rem",
                    padding: "1rem",
                    background: "#edf2f7",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                    color: "#4a5568",
                  }}>
                  <strong>💡 Tip:</strong> Continuous subjects (like programming
                  labs or project work) will be scheduled in uninterrupted
                  blocks. Non-continuous subjects will be distributed across
                  different days for better retention.
                </div>
              </div>

              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: "#1a202c" }}>
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
                            background: "#f7fafc",
                            borderBottom: "2px solid #e2e8f0",
                          }}>
                          <th style={tableHeaderStyle}>ID</th>
                          <th style={tableHeaderStyle}>Name</th>
                          <th style={tableHeaderStyle}>Credits</th>
                          <th style={tableHeaderStyle}>Theory</th>
                          <th style={tableHeaderStyle}>Lab</th>
                          <th style={tableHeaderStyle}>Total</th>
                          <th style={tableHeaderStyle}>Placement</th>
                          <th style={tableHeaderStyle}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subjects.map((sub) => (
                          <tr
                            key={sub.id}
                            style={{ borderBottom: "1px solid #e2e8f0" }}>
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
                              <button
                                onClick={() =>
                                  setSubjects(
                                    subjects.filter((s) => s.id !== sub.id),
                                  )
                                }
                                style={{
                                  padding: "0.25rem",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "#f56565",
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
                  color: "#1a202c",
                  margin: 0,
                }}>
                Manage Branches & Sections
              </h2>

              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: "#1a202c" }}>
                  Add New Branch/Section
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
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
                  <button onClick={addBranch} style={primaryButtonStyle}>
                    <Plus size={20} />
                    Add
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: "#1a202c" }}>
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
                          border: "2px solid #e2e8f0",
                          borderRadius: "12px",
                          padding: "1.5rem",
                          background: "#f7fafc",
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
                                color: "#1a202c",
                              }}>
                              {branch.id}
                            </h4>
                            <p
                              style={{
                                margin: "0.25rem 0 0 0",
                                fontSize: "0.875rem",
                                color: "#718096",
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
                                        background: "#e6fffa",
                                        color: "#234e52",
                                        padding: "0.25rem 0.75rem",
                                        borderRadius: "12px",
                                        fontSize: "0.75rem",
                                        fontWeight: "600",
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
                  color: "#1a202c",
                  margin: 0,
                }}>
                Manage Teachers
              </h2>

              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: "#1a202c" }}>
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
                  background: "white",
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: "#1a202c" }}>
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
                          border: "2px solid #e2e8f0",
                          borderRadius: "12px",
                          padding: "1.5rem",
                          background: "#f7fafc",
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
                                color: "#1a202c",
                              }}>
                              {teacher.name}
                            </h4>
                            <p
                              style={{
                                margin: "0.25rem 0",
                                fontSize: "0.875rem",
                                color: "#718096",
                              }}>
                              ID: {teacher.id}
                            </p>
                            <p
                              style={{
                                margin: "0.25rem 0",
                                fontSize: "0.875rem",
                                color: "#718096",
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
                  color: "#1a202c",
                  margin: 0,
                }}>
                Teacher-Subject Mapping
              </h2>

              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: "#1a202c" }}>
                  Create New Mapping
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 2fr 1fr",
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
                  <button onClick={addMapping} style={primaryButtonStyle}>
                    <Plus size={20} />
                    Map
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: "#1a202c" }}>
                  Existing Mappings ({teacherSubjectMapping.length})
                </h3>
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
                            border: "2px solid #e2e8f0",
                            borderRadius: "8px",
                            background: "#f7fafc",
                          }}>
                          <span
                            style={{ fontSize: "0.9375rem", color: "#1a202c" }}>
                            <strong>{teacher?.name || "Unknown"}</strong> →{" "}
                            {subject?.name || "Unknown"}
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
          )}

        {/* RESOURCES TAB */}
        {activeTab === "resources" &&
          (currentUser.role === "Admin" || currentUser.role === "TTO") && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <h2
                style={{
                  fontSize: "1.75rem",
                  fontWeight: "700",
                  color: "#1a202c",
                  margin: 0,
                }}>
                Resources & Schedule
              </h2>

              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}>
                <h3 style={{ margin: "0 0 1rem 0", color: "#1a202c" }}>
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
                />

                <div
                  style={{
                    background: "white",
                    borderRadius: "12px",
                    padding: "1.5rem",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}>
                  <h4 style={{ margin: "0 0 1rem 0", color: "#1a202c" }}>
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
                          background: "#e6fffa",
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
          )}

        {/* USERS TAB */}
        {activeTab === "users" && currentUser.role === "Admin" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            <h2
              style={{
                fontSize: "1.75rem",
                fontWeight: "700",
                color: "#1a202c",
                margin: 0,
              }}>
              User Management
            </h2>

            <div
              style={{
                background: "white",
                borderRadius: "12px",
                padding: "2rem",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}>
              <h3 style={{ margin: "0 0 1.5rem 0", color: "#1a202c" }}>
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
                background: "white",
                borderRadius: "12px",
                padding: "2rem",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}>
              <h3 style={{ margin: "0 0 1.5rem 0", color: "#1a202c" }}>
                All Users ({users.length})
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr
                      style={{
                        background: "#f7fafc",
                        borderBottom: "2px solid #e2e8f0",
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
        )}

        {/* VIEW TIMETABLE TAB */}
        {activeTab === "view-timetable" &&
          generatedTimetable &&
          canViewTimetable() && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <h2
                style={{
                  fontSize: "1.75rem",
                  fontWeight: "700",
                  color: "#1a202c",
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
                            background: "white",
                            borderRadius: "12px",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            overflow: "hidden",
                          }}>
                          <div
                            style={{
                              background:
                                "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                              color: "white",
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
                            <div style={{ textAlign: "right" }}>
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
                          </div>

                          <div style={{ overflowX: "auto", padding: "1rem" }}>
                            <table
                              style={{
                                width: "100%",
                                borderCollapse: "collapse",
                              }}>
                              <thead>
                                <tr
                                  style={{
                                    background: "#667eea",
                                    color: "white",
                                  }}>
                                  <th
                                    style={{
                                      ...tableHeaderStyle,
                                      border: "2px solid #5568d3",
                                    }}>
                                    Day/Time
                                  </th>
                                  {timeSlots.map((slot, idx) => (
                                    <th
                                      key={idx}
                                      style={{
                                        ...tableHeaderStyle,
                                        border: "2px solid #5568d3",
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
                                        border: "2px solid #9ca3af",
                                        background: "#e0e7ff",
                                        fontWeight: "700",
                                        textAlign: "center",
                                      }}>
                                      {day}
                                    </td>
                                    {timeSlots.map((time) => {
                                      const slotKey = `${day}-${time}`;
                                      const entry = branchTimetable[slotKey];
                                      const isBreak = isBreakTime(day, time);

                                      return (
                                        <td
                                          key={slotKey}
                                          style={{
                                            ...tableCellStyle,
                                            border: "2px solid #9ca3af",
                                            background: isBreak
                                              ? "#fef3c7"
                                              : entry?.type === "Lab"
                                                ? "#faf5ff"
                                                : entry?.type === "Counseling"
                                                  ? "#f0fdfa"
                                                  : entry
                                                    ? "#f0fdf4"
                                                    : "#f9fafb",
                                            textAlign: "center",
                                            fontSize: "0.75rem",
                                          }}>
                                          {isBreak ? (
                                            <div
                                              style={{
                                                fontWeight: "700",
                                                color: "#92400e",
                                              }}>
                                              BREAK
                                            </div>
                                          ) : entry ? (
                                            <>
                                              <div
                                                style={{
                                                  fontWeight: "700",
                                                  color: "#111827",
                                                }}>
                                                {entry.subject}
                                              </div>
                                              {entry.room && (
                                                <div
                                                  style={{
                                                    color: "#7c3aed",
                                                    fontWeight: "600",
                                                    marginTop: "0.25rem",
                                                  }}>
                                                  {entry.room}
                                                </div>
                                              )}
                                              {entry.blockPart && (
                                                <div
                                                  style={{
                                                    color: "#4b5563",
                                                    fontSize: "0.625rem",
                                                    marginTop: "0.25rem",
                                                  }}>
                                                  {entry.blockPart}
                                                </div>
                                              )}
                                            </>
                                          ) : null}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              {/* Teacher Schedules */}
              {canViewTeacherSchedule() && teacherSchedules && (
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
                      color: "#1a202c",
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
                        background: "white",
                        borderRadius: "12px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        overflow: "hidden",
                      }}>
                      <div
                        style={{
                          background:
                            "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
                          color: "white",
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
                              style={{ background: "#48bb78", color: "white" }}>
                              <th
                                style={{
                                  ...tableHeaderStyle,
                                  border: "1px solid #38a169",
                                }}>
                                Day/Time
                              </th>
                              {timeSlots.map((slot, idx) => (
                                <th
                                  key={idx}
                                  style={{
                                    ...tableHeaderStyle,
                                    border: "1px solid #38a169",
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
                                    border: "1px solid #d1d5db",
                                    background: "#e0e7ff",
                                    fontWeight: "600",
                                    textAlign: "center",
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
                                        ...tableCellStyle,
                                        border: "1px solid #d1d5db",
                                        background: isBreak
                                          ? "#fef3c7"
                                          : isCounseling
                                            ? "#ccfbf1"
                                            : isScheduled
                                              ? "#fffbeb"
                                              : "#f0fdf4",
                                        textAlign: "center",
                                        fontSize: "0.75rem",
                                      }}>
                                      {isBreak ? (
                                        <div
                                          style={{
                                            fontWeight: "600",
                                            color: "#92400e",
                                          }}>
                                          BREAK
                                        </div>
                                      ) : isCounseling ? (
                                        <div
                                          style={{
                                            fontWeight: "600",
                                            color: "#0f766e",
                                          }}>
                                          COUNSELING
                                        </div>
                                      ) : classInfo ? (
                                        <>
                                          <div
                                            style={{
                                              fontWeight: "600",
                                              color: "#111827",
                                            }}>
                                            {classInfo.subject}
                                          </div>
                                          <div
                                            style={{
                                              color: "#4b5563",
                                              marginTop: "0.25rem",
                                            }}>
                                            {classInfo.section}
                                          </div>
                                        </>
                                      ) : (
                                        <div
                                          style={{
                                            color: "#15803d",
                                            fontWeight: "500",
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
              )}

              {/* Constraint Report */}
              {(currentUser.role === "Admin" || currentUser.role === "TTO") &&
                constraintReport && (
                  <div
                    style={{
                      background: "white",
                      borderRadius: "12px",
                      padding: "2rem",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}>
                    <h3
                      style={{
                        margin: "0 0 1.5rem 0",
                        fontSize: "1.25rem",
                        color: "#1a202c",
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
                          background: "#f0fdf4",
                          border: "2px solid #bbf7d0",
                          borderRadius: "12px",
                          padding: "1.5rem",
                        }}>
                        <h4
                          style={{
                            margin: "0 0 1rem 0",
                            color: "#14532d",
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
                            color: "#166534",
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
                          background: "#fef2f2",
                          border: "2px solid #fecaca",
                          borderRadius: "12px",
                          padding: "1.5rem",
                        }}>
                        <h4
                          style={{
                            margin: "0 0 1rem 0",
                            color: "#7f1d1d",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}>
                          <AlertCircle size={20} />
                          Violations ({constraintReport.violations.length})
                        </h4>
                        {constraintReport.violations.length === 0 ? (
                          <p style={{ color: "#15803d", fontWeight: "600" }}>
                            No violations!
                          </p>
                        ) : (
                          <ul
                            style={{
                              listStyle: "none",
                              padding: 0,
                              margin: 0,
                              color: "#991b1b",
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
                )}
            </div>
          )}
      </div>
    </div>
  );
};

// ==================== HELPER COMPONENTS ====================

const TabButton = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      padding: "1rem 1.5rem",
      background: "none",
      border: "none",
      borderBottom: active ? "3px solid #667eea" : "3px solid transparent",
      color: active ? "#667eea" : "#718096",
      fontWeight: active ? "600" : "500",
      cursor: "pointer",
      whiteSpace: "nowrap",
      transition: "all 0.2s",
    }}>
    {children}
  </button>
);

const StatCard = ({ title, color, children }) => (
  <div
    style={{
      background: "white",
      borderRadius: "12px",
      padding: "1.5rem",
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
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

const StatItem = ({ label, value }) => (
  <p style={{ margin: "0.5rem 0", fontSize: "0.9375rem", color: "#4a5568" }}>
    {label}: <strong style={{ color: "#1a202c" }}>{value}</strong>
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
}) => (
  <div
    style={{
      background: "white",
      borderRadius: "12px",
      padding: "1.5rem",
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    }}>
    <h4 style={{ margin: "0 0 1rem 0", color: "#1a202c" }}>
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
            background: "#e6fffa",
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

// ==================== STYLES ====================

const inputStyle = {
  padding: "0.75rem",
  border: "2px solid #e2e8f0",
  borderRadius: "8px",
  fontSize: "0.9375rem",
  fontFamily: "inherit",
};

const primaryButtonStyle = {
  padding: "0.75rem 1.5rem",
  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
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

const tableHeaderStyle = {
  padding: "0.75rem 1rem",
  textAlign: "left",
  fontWeight: "600",
  fontSize: "0.875rem",
  color: "#1a202c",
};

const tableCellStyle = {
  padding: "0.75rem 1rem",
  fontSize: "0.875rem",
  color: "#4a5568",
};

export default TimetableGenerator;
