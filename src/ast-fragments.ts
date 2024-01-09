import { escapeLiteral } from "./escape";

/**
 * Generates an AST fragment that will check if a column value exists in a JSONB array stored in a `current_setting`
 * The AST fragment represents SQL that looks like this:
 *  = ANY (SELECT jsonb_array_elements_text(current_setting('ctx.my_context_value')::jsonb))
 */
export const jsonb_array_elements_text = (setting: string) => {
	return {
		type: "function",
		name: "ANY",
		args: {
			type: "expr_list",
			value: [
				{
					ast: {
						with: null,
						type: "select",
						options: null,
						distinct: {
							type: null,
						},
						columns: [
							{
								type: "expr",
								expr: {
									type: "function",
									name: "jsonb_array_elements_text",
									args: {
										type: "expr_list",
										value: [
											{
												type: "cast",
												keyword: "cast",
												expr: {
													type: "function",
													name: "current_setting",
													args: {
														type: "expr_list",
														value: [
															{
																type: "parameter",
																value: escapeLiteral(setting.replace(/^___yates_context_/, "")),
															},
														],
													},
												},
												as: null,
												symbol: "::",
												target: {
													dataType: "jsonb",
												},
												arrows: [],
												properties: [],
											},
										],
									},
								},
								as: null,
							},
						],
						into: {
							position: null,
						},
						from: null,
						where: null,
						groupby: null,
						having: null,
						orderby: null,
						limit: {
							seperator: "",
							value: [],
						},
						window: null,
					},
				},
			],
		},
	};
};
