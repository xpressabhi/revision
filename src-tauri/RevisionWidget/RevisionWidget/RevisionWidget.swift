import WidgetKit
import SwiftUI
import SQLite3

struct RevisionEntry: TimelineEntry {
    let date: Date
    let due: Int
    let new: Int
    let total: Int
    let decks: [(name: String, due: Int, total: Int)]
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> RevisionEntry {
        RevisionEntry(date: Date(), due: 12, new: 5, total: 88, decks: [
            ("DSA / LeetCode", 5, 75),
            ("System Design Concepts", 2, 3)
        ])
    }

    func getSnapshot(in context: Context, completion: @escaping (RevisionEntry) -> Void) {
        completion(loadStats())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RevisionEntry>) -> Void) {
        let entry = loadStats()
        // Refresh every 15 minutes
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
        let timeline = Timeline(entries: [entry], policy: .after(next))
        completion(timeline)
    }

    private func loadStats() -> RevisionEntry {
        // Try to read from revision.db at Application Support/com.revision.app/revision.db
        var due = 0, newCount = 0, total = 0
        var decks: [(String, Int, Int)] = []

        // Resolve DB path
        let fm = FileManager.default
        var dbPath: String? = nil

        // Primary: ~/Library/Application Support/com.revision.app/revision.db
        if let appSupport = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            let p = appSupport.appendingPathComponent("com.revision.app/revision.db").path
            if fm.fileExists(atPath: p) {
                dbPath = p
            }
        }
        // Fallback: try direct home path
        if dbPath == nil {
            let home = NSHomeDirectory()
            let p = "\(home)/Library/Application Support/com.revision.app/revision.db"
            if fm.fileExists(atPath: p) {
                dbPath = p
            }
        }
        // Also try group container if App Group exists
        if dbPath == nil, let groupURL = fm.containerURL(forSecurityApplicationGroupIdentifier: "group.com.revision.app") {
            let p = groupURL.appendingPathComponent("revision.db").path
            if fm.fileExists(atPath: p) {
                dbPath = p
            }
        }

        guard let path = dbPath else {
            // No DB yet — return placeholder with 0
            return RevisionEntry(date: Date(), due: 0, new: 0, total: 0, decks: [])
        }

        var db: OpaquePointer?
        if sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK, let db = db {
            defer { sqlite3_close(db) }

            // Total, due, new
            let now = ISO8601DateFormatter().string(from: Date())
            // Simplify: due = state != 'new' && due_at <= now, new = state == 'new'
            // Use query that works even if reviews table empty
            let countSQL = """
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN cs.state != 'new' AND cs.due_at <= ? THEN 1 ELSE 0 END) as due,
                    SUM(CASE WHEN cs.state == 'new' THEN 1 ELSE 0 END) as new
                FROM cards c JOIN card_state cs ON cs.card_id = c.id
                """

            var stmt: OpaquePointer?
            if sqlite3_prepare_v2(db, countSQL, -1, &stmt, nil) == SQLITE_OK, let stmt = stmt {
                sqlite3_bind_text(stmt, 1, (now as NSString).utf8String, -1, nil)
                if sqlite3_step(stmt) == SQLITE_ROW {
                    total = Int(sqlite3_column_int(stmt, 0))
                    // SUM may be NULL if no rows — handle
                    due = Int(sqlite3_column_int(stmt, 1))
                    newCount = Int(sqlite3_column_int(stmt, 2))
                    // If total is 0 but we have cards, the SUM may be 0
                    // sqlite3_column_int returns 0 for NULL, which is fine
                }
                sqlite3_finalize(stmt)
            }

            // Per-deck breakdown
            let deckSQL = """
                SELECT d.name, COUNT(c.id) as total,
                       SUM(CASE WHEN cs.state != 'new' AND cs.due_at <= ? THEN 1 ELSE 0 END) as due
                FROM decks d
                LEFT JOIN cards c ON c.deck_id = d.id
                LEFT JOIN card_state cs ON cs.card_id = c.id
                GROUP BY d.id, d.name
                ORDER BY d.id
                """
            var dstmt: OpaquePointer?
            if sqlite3_prepare_v2(db, deckSQL, -1, &dstmt, nil) == SQLITE_OK, let dstmt = dstmt {
                sqlite3_bind_text(dstmt, 1, (now as NSString).utf8String, -1, nil)
                while sqlite3_step(dstmt) == SQLITE_ROW {
                    if let cName = sqlite3_column_text(dstmt, 0) {
                        let name = String(cString: cName)
                        let t = Int(sqlite3_column_int(dstmt, 1))
                        let d = Int(sqlite3_column_int(dstmt, 2))
                        if t > 0 {
                            decks.append((name, d, t))
                        }
                    }
                }
                sqlite3_finalize(dstmt)
            }
        }

        return RevisionEntry(date: Date(), due: due, new: newCount, total: total, decks: decks)
    }
}

struct RevisionWidgetEntryView: View {
    var entry: Provider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Revision")
                    .font(.headline)
                    .fontWeight(.bold)
                Spacer()
                Text("Due \(entry.due) • New \(entry.new)")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }

            HStack(spacing: 8) {
                StatBadge(value: "\(entry.due)", label: "Due", color: .red)
                StatBadge(value: "\(entry.new)", label: "New", color: .blue)
                StatBadge(value: "\(entry.total)", label: "Total", color: .primary)
                Spacer()
                Text("Review")
                    .font(.caption).bold()
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Color.accentColor)
                    .foregroundColor(.white)
                    .clipShape(Capsule())
            }

            if !entry.decks.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(entry.decks.prefix(4), id: \.name) { deck in
                        HStack(spacing: 6) {
                            Circle()
                                .fill(colorForDeck(deck.name))
                                .frame(width: 7, height: 7)
                            Text(shorten(deck.name))
                                .font(.caption2).lineLimit(1)
                            Spacer()
                            Text("\(deck.due) due")
                                .font(.caption2).foregroundColor(.secondary)
                        }
                    }
                }
            } else if entry.total == 0 {
                Text("No cards yet — open Revision to seed Blind 75")
                    .font(.caption2).foregroundColor(.secondary)
            }

            Spacer(minLength: 0)
            HStack {
                Text("SQLite • revision.db")
                    .font(.caption2).foregroundColor(.secondary)
                Spacer()
                Text(entry.date, style: .time)
                    .font(.caption2).foregroundColor(.secondary)
            }
        }
        .padding(12)
        .containerBackground(for: .widget) {
            Color(.windowBackgroundColor)
        }
    }

    func shorten(_ name: String) -> String {
        name.replacingOccurrences(of: "System Design", with: "SD").replacingOccurrences(of: " / ", with: "/")
    }

    func colorForDeck(_ name: String) -> Color {
        switch name {
        case "DSA / LeetCode": return Color(red: 0.06, green: 0.65, blue: 0.91)
        case "System Design Concepts": return Color.purple
        case "System Design Use Cases": return Color.orange
        case "AI Concepts": return Color.green
        case "AI Use Cases": return Color.pink
        case "Behavioral": return Color.indigo
        default: return Color.gray
        }
    }
}

struct StatBadge: View {
    let value: String
    let label: String
    let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).fontWeight(.bold).foregroundColor(color)
            Text(label).font(.caption2).textCase(.uppercase).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(Color.secondary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

struct RevisionWidget: Widget {
    let kind: String = "com.revision.app.widget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            RevisionWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Revision — Due Today")
        .description("Shows due/new for your principal prep (DSA, System Design, AI).")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

#Preview(as: .systemMedium) {
    RevisionWidget()
} timeline: {
    RevisionEntry(date: Date(), due: 12, new: 5, total: 88, decks: [
        ("DSA / LeetCode", 8, 75),
        ("System Design Concepts", 2, 3),
        ("Behavioral", 0, 2)
    ])
}
