import { fieldDefinitions } from "./fields";
import { schemasLavoro } from "./schemasLavoro";
import { schemasCommerciale } from "./schemasCommerciale";

export { fieldDefinitions };

export const contractSchemas = { ...schemasLavoro, ...schemasCommerciale };