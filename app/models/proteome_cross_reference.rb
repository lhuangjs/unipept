# == Schema Information
#
# Table name: proteome_cross_references
#
#  id               :integer          not null, primary key
#  uniprot_entry_id :integer          not null
#  proteome_id      :integer          not null
#

class ProteomeCrossReference < ActiveRecord::Base
  include ReadOnlyModel
  attr_accessible nil

  belongs_to :uniprot_entry
  belongs_to :proteome

  # Returns a list of sequence_ids for a given proteome_id
  def self.get_sequence_ids(proteome_id)
    connection.select_values("SELECT DISTINCT original_sequence_id
      FROM peptides
      LEFT JOIN  proteome_cross_references ON peptides.uniprot_entry_id = proteome_cross_references.uniprot_entry_id
      WHERE proteome_cross_references.proteome_id = '#{proteome_id}'").to_a
  end
end
