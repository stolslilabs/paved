use paved::types::mode::Mode;

pub mod constants {
    pub const DEFAULT_TEMPLATE_DAILY: u32 = 4_000_000_001;
    pub const DEFAULT_TEMPLATE_WEEKLY: u32 = 4_000_000_002;
    pub const DEFAULT_TEMPLATE_TUTORIAL: u32 = 4_000_000_003;
}

#[generate_trait]
pub impl ConfigTemplatesImpl of ConfigTemplatesTrait {
    fn default_template_id(mode: Mode) -> u32 {
        match mode {
            Mode::Daily => constants::DEFAULT_TEMPLATE_DAILY,
            Mode::Weekly => constants::DEFAULT_TEMPLATE_WEEKLY,
            Mode::Tutorial => constants::DEFAULT_TEMPLATE_TUTORIAL,
            _ => constants::DEFAULT_TEMPLATE_DAILY,
        }
    }
}
