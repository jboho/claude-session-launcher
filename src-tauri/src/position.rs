#[cfg(test)]
mod tests {
    use super::*;

    const WORK: Rect = Rect { x: 0, y: 25, w: 1440, h: 875 };

    #[test]
    fn centers_under_the_tray_icon() {
        let tray = Rect { x: 700, y: 0, w: 30, h: 24 };
        // centered on the icon: 700 + 15 - 230 = 485; below it: 0 + 24 + 4 = 28
        assert_eq!(panel_position(Some(tray), WORK, 460, 620), (485, 28));
    }

    #[test]
    fn falls_back_to_top_center_when_the_tray_icon_is_hidden() {
        // A status item hidden behind the notch reports height 0; trusting it would push
        // the panel off-screen.
        let hidden = Rect { x: 0, y: 0, w: 0, h: 0 };
        assert_eq!(panel_position(Some(hidden), WORK, 460, 620), ((1440 - 460) / 2, 25 + 60));
    }

    #[test]
    fn falls_back_when_there_is_no_tray_rect_at_all() {
        assert_eq!(panel_position(None, WORK, 460, 620), ((1440 - 460) / 2, 25 + 60));
    }

    #[test]
    fn clamps_to_the_right_edge() {
        let tray = Rect { x: 1430, y: 0, w: 30, h: 24 };
        let (x, _) = panel_position(Some(tray), WORK, 460, 620);
        assert_eq!(x, 1440 - 460);
    }

    #[test]
    fn clamps_to_the_left_edge() {
        let tray = Rect { x: 0, y: 0, w: 20, h: 24 };
        let (x, _) = panel_position(Some(tray), WORK, 460, 620);
        assert_eq!(x, 0);
    }

    #[test]
    fn clamps_to_the_bottom_when_the_panel_is_taller_than_the_space_below() {
        let tray = Rect { x: 700, y: 0, w: 30, h: 24 };
        let short = Rect { x: 0, y: 25, w: 1440, h: 400 };
        let (_, y) = panel_position(Some(tray), short, 460, 620);
        // Cannot go below the work area; clamped, and never above its top.
        assert_eq!(y, 25);
    }

    #[test]
    fn respects_a_non_zero_work_area_origin_for_a_second_display() {
        let right = Rect { x: 1440, y: 25, w: 1920, h: 1055 };
        let (x, y) = panel_position(None, right, 460, 620);
        assert_eq!(x, 1440 + (1920 - 460) / 2);
        assert_eq!(y, 25 + 60);
    }

    // --- Additional coverage beyond the plan's baseline tests ---

    #[test]
    fn does_not_panic_when_the_panel_is_wider_than_the_work_area() {
        // A small external display or a scaled resolution can be narrower than the panel.
        // i32::clamp panics if min > max; the unguarded upper bound here (400 - 460 = -60)
        // would fall below the lower bound (0), so this must be guarded.
        let narrow = Rect { x: 0, y: 25, w: 400, h: 875 };
        let tray = Rect { x: 700, y: 0, w: 30, h: 24 };
        let (x, _) = panel_position(Some(tray), narrow, 460, 620);
        assert!(x >= narrow.x && x <= narrow.x + narrow.w, "x={x} must stay anchored in-bounds");
        assert_eq!(x, narrow.x, "clamped upper bound collapses to the lower bound (left edge)");
    }

    #[test]
    fn does_not_panic_when_the_panel_is_wider_and_taller_than_the_work_area() {
        let tiny = Rect { x: 0, y: 25, w: 400, h: 300 };
        let (x, y) = panel_position(None, tiny, 460, 620);
        assert_eq!(x, tiny.x);
        assert_eq!(y, tiny.y);
    }

    #[test]
    fn clamps_correctly_on_a_display_left_of_the_primary_with_negative_origin() {
        // macOS reports negative x/y for a display positioned left of / above the primary.
        let left_display = Rect { x: -1920, y: 25, w: 1920, h: 1055 };
        let (x, y) = panel_position(None, left_display, 460, 620);
        // Fallback top-center: -1920 + (1920 - 460) / 2 = -1190; well within
        // [-1920, -1920 + 1920 - 460] = [-1920, -460], so it must not be silently forced to 0.
        assert_eq!(x, -1190);
        assert_ne!(x, 0);
        assert_eq!(y, 25 + 60);
    }

    #[test]
    fn falls_back_when_tray_width_is_zero_but_height_is_nonzero() {
        // A real status item always has nonzero width and height; a zero-width rect is just
        // as degenerate as zero-height and gets the same "hidden icon" treatment (see the
        // doc comment on panel_position for the reasoning).
        let degenerate = Rect { x: 700, y: 0, w: 0, h: 24 };
        assert_eq!(
            panel_position(Some(degenerate), WORK, 460, 620),
            ((1440 - 460) / 2, 25 + 60)
        );
    }

    #[test]
    fn tray_present_but_hidden_matches_no_tray_at_all() {
        // Confirms the two fallback paths ("present but zero-size" vs "absent entirely")
        // are genuinely equivalent, not coincidentally equal for this one input.
        let hidden = Rect { x: 0, y: 0, w: 0, h: 0 };
        assert_eq!(
            panel_position(Some(hidden), WORK, 460, 620),
            panel_position(None, WORK, 460, 620)
        );
    }
}

/// A plain physical-pixel rectangle, so this logic is testable without a real screen.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

/// Where to put the panel: centered under the tray icon when it is really on screen,
/// otherwise top-center of the work area — then clamped fully inside the work area.
///
/// A tray icon hidden by the notch or a menu-bar manager reports height 0. Trusting that
/// rect would place the panel off-screen, so it is treated as "no tray icon". A real
/// status item always has nonzero width too, so a zero-width rect is treated the same way
/// (`t.w > 0 && t.h > 0`, not just height) — this is a defensive widening of the Electron
/// original, which only checked height, since either dimension collapsing to zero signals
/// the same "not actually present" condition.
pub fn panel_position(
    tray: Option<Rect>,
    work_area: Rect,
    panel_w: i32,
    panel_h: i32,
) -> (i32, i32) {
    let (mut x, mut y) = match tray {
        Some(t) if t.w > 0 && t.h > 0 => (t.x + t.w / 2 - panel_w / 2, t.y + t.h + 4),
        _ => (
            work_area.x + (work_area.w - panel_w) / 2,
            work_area.y + 60,
        ),
    };

    // .max(work_area.x)/.max(work_area.y) guards: when the panel is larger than the work
    // area, the upper clamp bound falls below the lower one, and i32::clamp panics if
    // min > max. The Electron original used nested Math.max/Math.min, which silently
    // produced a bad-but-not-fatal value instead of panicking.
    x = x.clamp(work_area.x, (work_area.x + work_area.w - panel_w).max(work_area.x));
    y = y.clamp(work_area.y, (work_area.y + work_area.h - panel_h).max(work_area.y));
    (x, y)
}
