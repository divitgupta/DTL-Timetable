import React from 'react';
import { Download, Printer } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const ProfessionalTimetable = ({
  branchData,
  timetableData,
  timeSlots,
  workingDays,
  breaks,
  subjects,
  teachers,
  teacherSubjectMapping,
  isBreakTime
}) => {
  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    try {
      const timetableElement = document.querySelector('.timetable-page');
      if (!timetableElement) {
        alert('Timetable not found');
        return;
      }

      // Show loading indicator
      const originalText = document.querySelector('.export-pdf-btn').textContent;
      document.querySelector('.export-pdf-btn').textContent = 'Generating PDF...';

      // Capture the timetable as canvas with high quality
      const canvas = await html2canvas(timetableElement, {
        scale: 2, // Higher quality
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      // Calculate PDF dimensions (A4 landscape)
      const imgWidth = 297; // A4 width in mm (landscape)
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Create PDF
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

      // Generate filename with branch and date
      const filename = `Timetable_${branchData.branch || 'Schedule'}_${branchData.section || ''}_${new Date().toISOString().split('T')[0]}.pdf`;

      // Download the PDF
      pdf.save(filename);

      // Restore button text
      document.querySelector('.export-pdf-btn').textContent = originalText;
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
      document.querySelector('.export-pdf-btn').textContent = 'Export PDF';
    }
  };

  // Get subject color based on type
  const getSubjectColor = (entry) => {
    if (!entry) return '#f9f9f9';
    if (entry.type === 'Lab') return '#f3e8ff';
    if (entry.type === 'Counseling') return '#dff6ff';
    return '#f0f9ff';
  };

  // Get all unique courses from timetable
  const getCoursesFromTimetable = () => {
    const coursesMap = new Map();

    Object.values(timetableData).forEach(entry => {
      if (entry && entry.subjectId && entry.subjectId !== 'COUNSELING') {
        const subject = subjects.find(s => s.id === entry.subjectId);
        const mapping = teacherSubjectMapping.find(m => m.subjectId === entry.subjectId);
        const teacher = mapping ? teachers.find(t => t.id === mapping.teacherId) : null;

        if (subject && !coursesMap.has(entry.subjectId)) {
          coursesMap.set(entry.subjectId, {
            code: subject.id,
            title: subject.name,
            teacher: teacher?.name || 'TBD',
            email: `${teacher?.id?.toLowerCase()}@college.edu` || 'tbd@college.edu'
          });
        }
      }
    });

    return Array.from(coursesMap.values());
  };

  const courses = getCoursesFromTimetable();

  return (
    <div className="professional-timetable-container">
      {/* Export Buttons */}
      <div className="export-buttons no-print" style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '1.5rem',
        justifyContent: 'flex-end'
      }}>
        <button onClick={handlePrint} style={{
          padding: '0.75rem 1.5rem',
          background: '#4ade80',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.9375rem'
        }}>
          <Printer size={18} />
          Print
        </button>
        <button onClick={handleExportPDF} className="export-pdf-btn" style={{
          padding: '0.75rem 1.5rem',
          background: '#0ea5e9',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.9375rem'
        }}>
          <Download size={18} />
          Export PDF
        </button>
      </div>

      {/* Professional Timetable */}
      <div className="timetable-page" style={{
        background: 'white',
        border: '3px solid #000',
        fontFamily: 'Arial, sans-serif',
        maxWidth: '100%',
        margin: '0 auto',
        overflow: 'hidden'
      }}>
        {/* Header Section */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          borderBottom: '3px solid #000',
          minHeight: '100px'
        }}>
          {/* Logo Section */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            borderRight: '3px solid #000',
            minWidth: '130px'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              border: '2px solid #333',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
              textAlign: 'center',
              fontWeight: '600',
              color: '#333'
            }}>
              COLLEGE<br />LOGO
            </div>
          </div>

          {/* Title and Details Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 0
          }}>
            {/* Title Section */}
            <div style={{
              padding: '0.75rem 1rem',
              borderRight: '3px solid #000'
            }}>
              <h1 style={{
                margin: 0,
                fontSize: '1.5rem',
                fontWeight: '700',
                color: '#000',
                textAlign: 'center'
              }}>
                Class TimeTable
              </h1>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem',
                marginTop: '0.5rem',
                fontSize: '0.875rem'
              }}>
                <div><strong>Program:</strong> {branchData.branch || 'Program'}</div>
                <div><strong>w.e.f:</strong> {new Date().toLocaleDateString('en-GB')}</div>
                <div><strong>Semester:</strong> {branchData.semester}</div>
                <div><strong>Section:</strong> {branchData.section}</div>
              </div>
            </div>

            {/* Program/Section Info */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              minWidth: '200px'
            }}>
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderBottom: '3px solid #000',
                padding: '0.5rem 1.5rem',
                fontWeight: '700',
                fontSize: '1.125rem'
              }}>
                UG
              </div>
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderBottom: '3px solid #000',
                padding: '0.5rem 1.5rem',
                fontWeight: '700',
                fontSize: '1.125rem'
              }}>
                {branchData.branch?.substring(0, 3)?.toUpperCase() || 'CSE'}
              </div>
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.5rem 1.5rem',
                fontWeight: '700',
                fontSize: '1.125rem'
              }}>
                {branchData.section}
              </div>
            </div>
          </div>
        </div>

        {/* Timetable Grid */}
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.75rem'
        }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{
                border: '2px solid #000',
                padding: '0.75rem 0.5rem',
                background: '#f5f5f5',
                fontWeight: '700',
                width: '80px'
              }}>
                <div>TIME</div>
                <div style={{ fontSize: '0.7rem', marginTop: '0.25rem' }}>DAY</div>
              </th>
              {timeSlots.map((slot, idx) => {
                const [start, end] = slot.split('-');
                return (
                  <th key={idx} style={{
                    border: '2px solid #000',
                    padding: '0.6rem 0.3rem',
                    background: '#f5f5f5',
                    fontWeight: '700',
                    minWidth: '75px',
                    fontSize: '0.75rem',
                    color: '#000'
                  }}>
                    <div>{start}</div>
                    <div style={{ margin: '0.1rem 0' }}>–</div>
                    <div>{end}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {workingDays.map(day => (
              <tr key={day}>
                <td style={{
                  border: '2px solid #000',
                  padding: '1rem 0.5rem',
                  background: '#f5f5f5',
                  fontWeight: '700',
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  fontSize: '0.7rem'
                }}>
                  {day.slice(0, 3)}
                </td>
                {timeSlots.map((time, idx) => {
                  const slotKey = `${day}-${time}`;
                  const entry = timetableData[slotKey];
                  const isBreak = isBreakTime(day, time);

                  // Find if this slot is part of a continuous block
                  const nextSlotKey = `${day}-${timeSlots[idx + 1]}`;
                  const prevSlotKey = `${day}-${timeSlots[idx - 1]}`;
                  const nextEntry = timetableData[nextSlotKey];
                  const prevEntry = timetableData[prevSlotKey];

                  // Skip if previous entry is same (part of continuous block)
                  if (prevEntry && entry && prevEntry.subjectId === entry.subjectId &&
                    prevEntry.teacherId === entry.teacherId) {
                    return null;
                  }

                  // Calculate colspan for continuous blocks
                  let colspan = 1;
                  if (entry && !isBreak) {
                    let checkIdx = idx + 1;
                    while (checkIdx < timeSlots.length) {
                      const checkKey = `${day}-${timeSlots[checkIdx]}`;
                      const checkEntry = timetableData[checkKey];
                      if (checkEntry && checkEntry.subjectId === entry.subjectId &&
                        checkEntry.teacherId === entry.teacherId) {
                        colspan++;
                        checkIdx++;
                      } else {
                        break;
                      }
                    }
                  }

                  // Get break type
                  const breakInfo = breaks.find(br =>
                    (br.day === 'All' || br.day === day) && isBreakTime(day, time)
                  );

                  return (
                    <td key={slotKey} colSpan={colspan} style={{
                      border: '2px solid #000',
                      padding: '0.5rem 0.25rem',
                      background: getSubjectColor(entry),
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      minHeight: '50px'
                    }}>
                      {isBreak && breakInfo ? (
                        <div style={{ fontWeight: '700', fontSize: '0.8rem', color: '#000' }}>
                          {breakInfo.type}
                        </div>
                      ) : entry ? (
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#000' }}>
                            {entry.subject.replace(' (Theory)', '').replace(' (Lab)', '')}
                          </div>
                          {entry.type === 'Lab' && (
                            <div style={{ fontSize: '0.7rem', color: '#7c3aed', fontWeight: '700' }}>
                              {entry.room || 'LAB'}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Course Details Section */}
        <div style={{
          borderTop: '3px solid #000',
          padding: '1rem',
          fontSize: '0.7rem'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: '0.5rem 1rem'
          }}>
            {courses.map((course, idx) => (
              <div key={idx} style={{ marginBottom: '0.25rem' }}>
                <strong>{course.code}</strong> - {course.title} – <strong>{course.teacher}</strong>, {course.email}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '2px solid #000',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          fontSize: '0.7rem',
          fontWeight: '600'
        }}>
          <div style={{ padding: '0.75rem', textAlign: 'center', borderRight: '2px solid #000' }}>
            Dept. TTO
          </div>
          <div style={{ padding: '0.75rem', textAlign: 'center', borderRight: '2px solid #000' }}>
            Dept. Head
          </div>
          <div style={{ padding: '0.75rem', textAlign: 'center', borderRight: '2px solid #000' }}>
            Chief-TTO
          </div>
          <div style={{ padding: '0.75rem', textAlign: 'center' }}>
            Dean Academics
          </div>
        </div>
      </div>

      <style jsx>{`
        @media print {
          .no-print {
            display: none !important;
          }
          
          .timetable-page {
            width: 100%;
            max-width: none;
            page-break-after: always;
          }
          
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
        }
      `}</style>
    </div>
  );
};

export default ProfessionalTimetable;
