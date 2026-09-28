use serde::{Deserialize, Serialize};

// Les modèles seront étoffés dans les étapes suivantes
#[derive(Debug, Serialize, Deserialize)]
pub struct School {
    pub id: String,
    pub name: String,
}
